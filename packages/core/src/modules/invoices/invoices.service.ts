import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import { InvoicesRepository } from './invoices.repository'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { LicensesService } from '../licenses/licenses.service'
import { OrdersService } from '../orders/orders.service'
import dayjs from 'dayjs'

@Injectable()
export class InvoicesService {

  private readonly logger = new Logger(InvoicesService.name)

  constructor(
    private readonly repo: InvoicesRepository,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptions: SubscriptionsService,
    private readonly licenses: LicensesService,
    private readonly orders: OrdersService,
  ) {}

  // ─── Chamado pelo WebhookProcessor quando pagamento é confirmado ─────────

  async markPaid(externalChargeId: string, payload: any): Promise<void> {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
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
    await this.repo.updateCharge(chargeId, { status: 'paid', paidAt })

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
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) return
    const chargeId = charge.id
    const chargeAttemptNumber = charge.attemptNumber ?? charge.attempt_number
    const chargeMaxAttempts = charge.maxAttempts ?? charge.max_attempts
    const chargeInvoiceId = charge.invoiceId ?? charge.invoice_id

    await this.repo.updateCharge(chargeId, {
      status: 'failed',
      failedReason: reason,
      nextRetryAt: this.calculateNextRetry(chargeAttemptNumber),
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
  }

  async handleChargeback(externalChargeId: string): Promise<void> {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) return
    const chargeId = charge.id
    const chargeInvoiceId = charge.invoiceId ?? charge.invoice_id

    await this.repo.updateCharge(chargeId, { status: 'refunded' })
    await this.repo.updateInvoice(chargeInvoiceId, { status: 'void' })

    const invoice = await this.repo.findById(chargeInvoiceId)

    // Suspende a licença imediatamente em caso de chargeback
    const invoiceSubscriptionId = invoice.subscriptionId ?? invoice.subscription_id
    if (invoiceSubscriptionId) {
      const sub = await this.subscriptions.findById(invoiceSubscriptionId)
      const license = await this.licenses.findByCustomerAndProduct(
        sub.customerId, sub.productId
      )
      if (license) {
        await this.licenses.suspend(license.id, 'Chargeback recebido')
      }
    }

    this.logger.warn(`Chargeback processado: charge ${externalChargeId}`)
  }

  async markChargeExpired(externalChargeId: string): Promise<void> {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) return
    await this.repo.updateCharge(charge.id, { status: 'canceled' })
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
}
