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
  ): Promise<Subscription> {
    const sub = await this.findById(subscriptionId)

    if (sub.status === 'canceled') return sub

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

  // Cancelamento por external_subscription_id (vindo do gateway via webhook)
  async cancelByExternal(externalId: string): Promise<void> {
    const sub = await this.repo.findByExternalId(externalId)
    if (!sub) {
      this.logger.warn(`Assinatura externa não encontrada: ${externalId}`)
      return
    }
    await this.cancel(sub.id, 'Cancelado pelo gateway', false)
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
