import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { InvoicesRepository } from './invoices.repository'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { LicensesService } from '../licenses/licenses.service'
import { OrdersService } from '../orders/orders.service'
import dayjs from 'dayjs'
import { InternalEventsService } from '../webhooks/internal-events.service'
import { AccessCacheService } from '../../shared/cache/access-cache.service'

@Injectable()
export class InvoicesService {

  private readonly logger = new Logger(InvoicesService.name)

  constructor(
    private readonly repo: InvoicesRepository,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptions: SubscriptionsService,
    private readonly licenses: LicensesService,
    private readonly orders: OrdersService,
    private readonly internalEvents: InternalEventsService,
    private readonly accessCache: AccessCacheService,
  ) {}

  // ─── Chamado pelo WebhookProcessor quando pagamento é confirmado ─────────

  async markPaid(externalChargeId: string, payload: any): Promise<void> {
    const charge = await this.resolveChargeForEvent(externalChargeId, payload)
    if (!charge) {
      this.logger.warn(`Charge não encontrado: ${externalChargeId}`)
      return
    }

    const chargeStatus = charge.status
    const chargeId = charge.id
    const chargeCustomerId = charge.customerId ?? charge.customer_id
    const chargeAmount = charge.amount
    const chargeCurrency = charge.currency
    const chargePaymentMethod = charge.paymentMethod ?? charge.payment_method
    const chargeGatewayName = charge.gatewayName ?? charge.gateway_name
    const chargeInvoiceId = charge.invoiceId ?? charge.invoice_id

    let shouldCreatePayment = true
    if (chargeStatus === 'paid') {
      shouldCreatePayment = false
    }

    const paidAt = new Date(payload.paymentDate ?? payload.confirmedDate ?? Date.now())

    // 1. Atualiza o charge
    await this.repo.updateCharge(chargeId, {
      status: 'paid',
      paidAt,
      externalChargeId: externalChargeId || undefined,
    })

    // 2. Cria o payment
    if (shouldCreatePayment) {
      await this.repo.createPayment({
        chargeId: chargeId,
        customerId: chargeCustomerId,
        amount: chargeAmount,
        currency: chargeCurrency,
        paymentMethod: chargePaymentMethod,
        status: 'captured',
        externalPaymentId: payload.id,
        gatewayName: chargeGatewayName,
        capturedAt: paidAt,
        rawPayload: payload,
      })
    }

    // 3. Atualiza a invoice
    const invoice = await this.repo.findById(chargeInvoiceId)
    await this.repo.updateInvoice(invoice.id, { status: 'paid', paidAt })

    // 4. Aciona a lógica de negócio conforme a origem
    const invoiceSubscriptionId = invoice.subscriptionId ?? invoice.subscription_id
    const invoiceOrderId = invoice.orderId ?? invoice.order_id
    if (invoiceSubscriptionId) {
      await this.activateSubscriptionFromPayment(invoiceSubscriptionId, invoice)
    } else if (invoiceOrderId) {
      await this.activateOrderFromPayment(invoiceOrderId)
    }

    const context = await this.resolveOriginContext(invoice)
    if (context.productId) {
      await this.internalEvents.dispatch({
        productId: context.productId,
        customerId: context.customerId ?? chargeCustomerId,
        eventType: 'payment.approved',
        payload: {
          chargeId: externalChargeId,
          status: 'paid',
          amount: chargeAmount,
          currency: chargeCurrency,
          originType: context.originType,
          originId: context.originId,
        },
      })
      this.accessCache.invalidateStatus(context.customerId ?? chargeCustomerId, context.productId)
    } else {
      this.accessCache.invalidateCustomer(chargeCustomerId)
    }

    this.logger.log(`Pagamento confirmado: charge ${charge.id}, invoice ${invoice.id}`)
  }

  private async activateSubscriptionFromPayment(subscriptionId: string, invoice: any) {
    // Calcula o período da renovação
    const sub = await this.subscriptions.findById(subscriptionId)
    const periodStart = new Date()
    const periodEnd = this.calculateNextPeriod(sub.plan?.intervalUnit, sub.plan?.intervalCount)

    await this.subscriptions.activate(subscriptionId, periodStart, periodEnd)
  }

  private async activateOrderFromPayment(orderId: string) {
    const order = await this.orders.findById(orderId)
    await this.orders.markPaid(orderId)

    // Emite licença para compra avulsa
    const plan = order.plan
    const expiresAt = plan?.intervalUnit === 'lifetime'
      ? null  // vitalício
      : plan
        ? dayjs().add(plan.intervalCount, plan.intervalUnit).toDate()
        : null

    await this.licenses.emit({
      customerId: order.customerId,
      productId: order.productId,
      planId: order.planId,
      originType: 'order',
      originId: orderId,
      expiresAt,
      maxUsers: plan?.maxUsers,
      featureSet: plan?.featureSet,
    })
  }

  async markFailed(externalChargeId: string, reason: string): Promise<void> {
    const charge = await this.resolveChargeForEvent(externalChargeId, { reason })
    if (!charge) return
    const chargeId = charge.id
    const chargeAttemptNumber = charge.attemptNumber ?? charge.attempt_number
    const chargeMaxAttempts = charge.maxAttempts ?? charge.max_attempts
    const chargeInvoiceId = charge.invoiceId ?? charge.invoice_id

    await this.repo.updateCharge(chargeId, {
      status: 'failed',
      failedReason: reason,
      nextRetryAt: this.calculateNextRetry(chargeAttemptNumber),
      externalChargeId: externalChargeId || undefined,
    })

    // Se atingiu o máximo de tentativas, marca a invoice como incobrable
    if (chargeAttemptNumber >= chargeMaxAttempts) {
      await this.repo.updateInvoice(chargeInvoiceId, { status: 'uncollectible' })

      // Marca a assinatura como overdue
      const invoice = await this.repo.findById(chargeInvoiceId)
      const invoiceSubscriptionId = invoice.subscriptionId ?? invoice.subscription_id
      if (invoiceSubscriptionId) {
        await this.subscriptions.markOverdue(invoiceSubscriptionId)
      }
    }

    const invoice = await this.repo.findById(chargeInvoiceId)
    const context = await this.resolveOriginContext(invoice)
    if (context.productId) {
      await this.internalEvents.dispatch({
        productId: context.productId,
        customerId: context.customerId ?? charge.customerId ?? charge.customer_id,
        eventType: 'payment.failed',
        payload: {
          chargeId: externalChargeId,
          status: 'failed',
          reason,
          originType: context.originType,
          originId: context.originId,
        },
      })
      this.accessCache.invalidateStatus(context.customerId ?? charge.customerId ?? charge.customer_id, context.productId)
    } else {
      this.accessCache.invalidateCustomer(charge.customerId ?? charge.customer_id)
    }
  }

  async handleChargeback(externalChargeId: string): Promise<void> {
    const charge = await this.resolveChargeForEvent(externalChargeId, {})
    if (!charge) return
    const chargeId = charge.id
    const chargeInvoiceId = charge.invoiceId ?? charge.invoice_id

    await this.repo.updateCharge(chargeId, { status: 'refunded' })
    await this.repo.updateInvoice(chargeInvoiceId, { status: 'void' })

    const invoice = await this.repo.findById(chargeInvoiceId)
    const context = await this.resolveOriginContext(invoice)

    // Suspende a licença imediatamente em caso de chargeback
    const invoiceSubscriptionId = context.originType === 'subscription' ? context.originId : null
    if (invoiceSubscriptionId) {
      const sub = await this.subscriptions.findById(invoiceSubscriptionId)
      const license = await this.licenses.findByCustomerAndProduct(
        sub.customerId, sub.productId
      )
      if (license) {
        await this.licenses.suspend(license.id, 'Chargeback recebido')
      }

      if (context.productId && context.customerId) {
        await this.internalEvents.dispatch({
          productId: context.productId,
          customerId: context.customerId,
          eventType: 'payment.chargeback',
          payload: {
            chargeId: externalChargeId,
            status: 'chargeback',
            originType: context.originType,
            originId: context.originId,
          },
        })
        this.accessCache.invalidateStatus(context.customerId, context.productId)
      }
    }

    this.logger.warn(`Chargeback processado: charge ${externalChargeId}`)
  }

  async markChargeExpired(externalChargeId: string): Promise<void> {
    const charge = await this.resolveChargeForEvent(externalChargeId, {})
    if (!charge) return
    await this.repo.updateCharge(charge.id, { status: 'canceled' })
    const invoice = await this.repo.findById(charge.invoiceId ?? charge.invoice_id)
    const context = await this.resolveOriginContext(invoice)
    if (!context.productId || !context.customerId) return
    await this.internalEvents.dispatch({
      productId: context.productId,
      customerId: context.customerId,
      eventType: 'pix.expired',
      payload: {
        chargeId: externalChargeId,
        status: 'canceled',
        originType: context.originType,
        originId: context.originId,
      },
    })
    this.accessCache.invalidateStatus(context.customerId, context.productId)
  }

  private async resolveChargeForEvent(externalChargeId: string, payload: any) {
    if (externalChargeId) {
      const byExternal = await this.repo.findLatestChargeByExternalId(externalChargeId)
      if (byExternal) return byExternal
    }

    const externalReference =
      payload?.externalReference ??
      payload?.external_reference ??
      payload?.charge?.external_reference

    if (!externalReference || typeof externalReference !== 'string') {
      return null
    }

    const [originTypeRaw, ...rest] = externalReference.split(':')
    const originType = originTypeRaw === 'subscription' ? 'subscription' : originTypeRaw === 'order' ? 'order' : null
    const originId = rest.join(':')
    if (!originType || !originId) return null

    const byOrigin = await this.repo.findLatestChargeByOrigin(originType, originId)
    if (byOrigin) {
      this.logger.log(`Charge resolvido por external_reference: ${originType}:${originId}`)
    }
    return byOrigin
  }

  async findById(id: string) {
    const invoice = await this.repo.findById(id)
    if (!invoice) throw new NotFoundException(`Invoice ${id} não encontrada`)
    return invoice
  }

  private calculateNextPeriod(unit = 'month', count = 1): Date {
    return dayjs().add(count, unit as any).toDate()
  }

  private calculateNextRetry(attempt: number): Date {
    // Backoff exponencial: 1h, 6h, 24h
    const delays = [1, 6, 24]
    const hours = delays[attempt - 1] ?? 24
    return dayjs().add(hours, 'hour').toDate()
  }

  private async resolveOriginContext(invoice: any): Promise<{
    originType: 'subscription' | 'order'
    originId: string | null
    productId: string | null
    customerId: string | null
  }> {
    const subscriptionId = invoice?.subscriptionId ?? invoice?.subscription_id
    const orderId = invoice?.orderId ?? invoice?.order_id
    if (subscriptionId) {
      const sub = await this.subscriptions.findById(subscriptionId)
      return {
        originType: 'subscription',
        originId: sub.id,
        productId: sub.productId,
        customerId: sub.customerId,
      }
    }
    if (orderId) {
      const order = await this.orders.findById(orderId)
      return {
        originType: 'order',
        originId: order.id,
        productId: order.productId,
        customerId: order.customerId,
      }
    }
    return {
      originType: 'order',
      originId: null,
      productId: null,
      customerId: null,
    }
  }
}
