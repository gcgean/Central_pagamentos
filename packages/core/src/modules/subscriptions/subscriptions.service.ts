import {
  Injectable, NotFoundException, ConflictException, BadRequestException, Logger,
  Inject, forwardRef
} from '@nestjs/common'
import { SubscriptionsRepository } from './subscriptions.repository'
import { LicensesService } from '../licenses/licenses.service'
import { InvoicesService } from '../invoices/invoices.service'
import { AuditService } from '../admin/audit.service'
import { CreateSubscriptionDto } from './dto/create-subscription.dto'
import { Subscription } from './entities/subscription.entity'
import dayjs from 'dayjs'
import { InternalEventsService } from '../webhooks/internal-events.service'
import { AccessCacheService } from '../../shared/cache/access-cache.service'
import { PaymentsService } from '../payments/payments.service'
import { PlansService } from '../plans/plans.service'

@Injectable()
export class SubscriptionsService {

  private readonly logger = new Logger(SubscriptionsService.name)

  constructor(
    private readonly repo: SubscriptionsRepository,
    private readonly licenses: LicensesService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoices: InvoicesService,
    private readonly audit: AuditService,
    private readonly internalEvents: InternalEventsService,
    private readonly accessCache: AccessCacheService,
    private readonly payments: PaymentsService,
    private readonly plans: PlansService,
  ) {}

  async create(dto: CreateSubscriptionDto, actorId?: string): Promise<Subscription> {
    // Impede duplicidade do mesmo plano (mesmo cliente + mesmo produto ativo)
    const active = await this.repo.findActiveByCustomerAndProduct(dto.customerId, dto.productId)
    if (active) {
      throw new ConflictException(
        `Cliente já possui assinatura ativa para este produto. Use change-plan para alterar.`
      )
    }

    const subscription = await this.repo.create({
      customerId: dto.customerId,
      productId: dto.productId,
      planId: dto.planId,
      contractedAmount: dto.contractedAmount,
      status: (dto.trialDays ?? 0) > 0 ? 'trialing' : 'pending',
      startedAt: new Date(),
      trialEndsAt: (dto.trialDays ?? 0) > 0
        ? dayjs().add(dto.trialDays!, 'day').toDate()
        : null,
    })

    // Se trial, emite licença imediatamente
    if ((dto.trialDays ?? 0) > 0) {
      await this.licenses.emit({
        customerId: dto.customerId,
        productId: dto.productId,
        planId: dto.planId,
        originType: 'trial',
        originId: subscription.id,
        expiresAt: dayjs().add(dto.trialDays!, 'day').toDate(),
        maxUsers: dto.maxUsers,
        featureSet: dto.featureSet,
      })
    }

    await this.audit.log({
      actorType: 'admin',
      actorId,
      action: 'subscription.create',
      entityType: 'subscription',
      entityId: subscription.id,
      afterData: subscription,
    })

    return subscription
  }

  // Chamado após pagamento confirmado
  async activate(subscriptionId: string, periodStart: Date, periodEnd: Date): Promise<Subscription> {
    const sub = await this.findById(subscriptionId)

    // Rede de segurança: se o gateway mandar um período degenerado (fim <= início),
    // a licença nasceria vencida — o cliente paga o mês e recebe só a carência.
    // Nesse caso derivamos o fim pelo intervalo do plano contratado.
    if (periodEnd.getTime() <= periodStart.getTime()) {
      const plan = await this.plans.findById(sub.planId)
      const unit = (plan.intervalUnit ?? 'month') as 'day' | 'week' | 'month' | 'year'
      const count = Number(plan.intervalCount ?? 1) || 1
      const derived = dayjs(periodStart).add(count, unit).toDate()
      this.logger.warn(
        `Período inválido recebido para assinatura ${subscriptionId} ` +
        `(${periodStart.toISOString()} → ${periodEnd.toISOString()}). ` +
        `Derivado do plano (${count} ${unit}): ${derived.toISOString()}`,
      )
      periodEnd = derived
    }

    const updated = await this.repo.update(subscriptionId, {
      status: 'active',
      startedAt: sub.startedAt ?? periodStart,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextBillingAt: periodEnd,
    })

    // Emite ou renova a licença
    await this.licenses.emit({
      customerId: sub.customerId,
      productId: sub.productId,
      planId: sub.planId,
      originType: 'subscription',
      originId: sub.id,
      expiresAt: dayjs(periodEnd).add(7, 'day').toDate(), // + grace
    })

    this.logger.log(`Assinatura ativada: ${subscriptionId} — período ${periodStart} → ${periodEnd}`)
    return updated
  }

  // Assinatura em atraso (cobrança vencida)
  async markOverdue(subscriptionId: string): Promise<Subscription> {
    const sub = await this.findById(subscriptionId)

    if (sub.status === 'overdue') return sub

    const updated = await this.repo.update(subscriptionId, { status: 'overdue' })

    // Não suspende a licença imediatamente — respeita grace period
    this.logger.log(`Assinatura em atraso: ${subscriptionId}`)
    return updated
  }

  // Cancelamento manual ou automático
  async cancel(
    subscriptionId: string,
    reason: string,
    immediate = false,
    actorId?: string,
    skipGatewayCancel = false,
  ): Promise<Subscription> {
    const sub = await this.findById(subscriptionId)

    if (sub.status === 'canceled') return sub

    // Cancela a cobrança recorrente no gateway (ex: Stripe Subscriptions) ANTES
    // de marcar como cancelado localmente — senão o Hub mostra "cancelado" mas o
    // cartão do cliente continua sendo cobrado automaticamente todo ciclo.
    if (!skipGatewayCancel) {
      await this.payments.cancelRecurringSubscription(sub.gatewayName, sub.externalSubscriptionId)
    }

    const updated = await this.repo.update(subscriptionId, {
      status: 'canceled',
      canceledAt: new Date(),
      cancellationReason: reason,
    })

    if (immediate) {
      // Revoga licença imediatamente
      const license = await this.licenses.findByCustomerAndProduct(sub.customerId, sub.productId)
      if (license) {
        await this.licenses.revoke(license.id, `Cancelamento: ${reason}`, actorId ?? 'system')
      }
    }
    // Se não for imediato, licença permanece até expirar naturalmente

    await this.internalEvents.dispatch({
      productId: sub.productId,
      customerId: sub.customerId,
      eventType: 'subscription.canceled',
      payload: {
        subscriptionId,
        reason,
        immediate,
        status: 'canceled',
      },
    })
    this.accessCache.invalidateStatus(sub.customerId, sub.productId)

    await this.audit.log({
      actorType: actorId ? 'admin' : 'system',
      actorId,
      action: 'subscription.cancel',
      entityType: 'subscription',
      entityId: subscriptionId,
      beforeData: sub,
      afterData: updated,
      note: reason,
    })

    return updated
  }

  // Troca de plano (upgrade/downgrade)
  async changePlan(
    subscriptionId: string,
    newPlanId: string,
    newAmount: number,
    actorId: string,
  ): Promise<Subscription> {
    const sub = await this.findById(subscriptionId)

    if (!['active', 'overdue', 'trialing'].includes(sub.status)) {
      throw new BadRequestException(`Não é possível trocar plano em status "${sub.status}"`)
    }

    const before = { ...sub }

    const updated = await this.repo.update(subscriptionId, {
      planId: newPlanId,
      contractedAmount: newAmount,
    })

    // Atualiza a licença com os novos features do plano
    const license = await this.licenses.findByCustomerAndProduct(sub.customerId, sub.productId)
    if (license) {
      await this.licenses.renew(license.id, { planId: newPlanId })
    }

    await this.audit.log({
      actorType: 'admin',
      actorId,
      action: 'subscription.change_plan',
      entityType: 'subscription',
      entityId: subscriptionId,
      beforeData: before,
      afterData: updated,
    })

    return updated
  }

  // Cancelamento por external_subscription_id (vindo do gateway via webhook).
  // O gateway já cancelou a cobrança recorrente do lado dele (é o próprio
  // evento que está chegando aqui) — não precisa (nem deve) chamar de volta.
  async cancelByExternal(externalId: string): Promise<void> {
    const sub = await this.repo.findByExternalId(externalId)
    if (!sub) {
      this.logger.warn(`Assinatura externa não encontrada: ${externalId}`)
      return
    }
    await this.cancel(sub.id, 'Cancelado pelo gateway', false, undefined, true)
  }

  // ── Recorrência nativa do gateway (ex: Stripe Subscriptions) ────────────────
  //
  // Vincula a assinatura interna ao id de assinatura do gateway, a partir do
  // client_reference_id do Checkout Session ("subscription:<id>"). É o único
  // momento em que a ligação existe — depois disso, activateByExternal e
  // markOverdueByExternal já encontram a assinatura por external_subscription_id.
  async linkExternalSubscription(
    externalReference: string,
    externalSubscriptionId: string,
    gatewayName: string,
  ): Promise<void> {
    const [originType, ...rest] = String(externalReference || '').split(':')
    const subscriptionId = rest.join(':')
    if (originType !== 'subscription' || !subscriptionId) {
      this.logger.warn(`externalReference inválida para vincular assinatura ao gateway: "${externalReference}"`)
      return
    }
    await this.repo.update(subscriptionId, { externalSubscriptionId, gatewayName } as Partial<Subscription>)
    this.logger.log(`Assinatura ${subscriptionId} vinculada ao gateway ${gatewayName} (external: ${externalSubscriptionId})`)
  }

  /**
   * Ativa/renova a assinatura a partir do id externo (webhook de fatura paga).
   * Lança quando o vínculo externo ainda não existe, para que o BullMQ tente
   * de novo — cobre o caso raro do webhook de fatura chegar antes do webhook
   * que vincula o external_subscription_id (checkout.session.completed).
   */
  async activateByExternal(externalId: string, periodStart: Date, periodEnd: Date): Promise<void> {
    const sub = await this.repo.findByExternalId(externalId)
    if (!sub) {
      throw new NotFoundException(`Assinatura externa ainda não vinculada: ${externalId}`)
    }
    await this.activate(sub.id, periodStart, periodEnd)
  }

  /** Marca em atraso a partir do id externo (webhook de fatura com cobrança recusada). */
  async markOverdueByExternal(externalId: string): Promise<void> {
    const sub = await this.repo.findByExternalId(externalId)
    if (!sub) {
      throw new NotFoundException(`Assinatura externa ainda não vinculada: ${externalId}`)
    }
    await this.markOverdue(sub.id)
  }

  async findById(id: string): Promise<Subscription> {
    const sub = await this.repo.findById(id)
    if (!sub) throw new NotFoundException(`Assinatura ${id} não encontrada`)
    return sub
  }

  async findByCustomer(customerId: string): Promise<Subscription[]> {
    return this.repo.findByCustomer(customerId)
  }

  async findAll(): Promise<Subscription[]> {
    return this.repo.findAll()
  }
}
