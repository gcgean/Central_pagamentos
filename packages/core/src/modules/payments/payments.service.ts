import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common'
import { AsaasGateway } from './gateways/asaas.gateway'
import { MercadoPagoGateway } from './gateways/mercadopago.gateway'
import { LivePixGateway } from './gateways/livepix.gateway'
import { StripeGateway } from './gateways/stripe.gateway'
import { PaymentsRepository } from './payments.repository'
import { SettingsService } from '../settings/settings.service'
import { InvoicesService } from '../invoices/invoices.service'

@Injectable()
export class PaymentsService {

  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly asaas: AsaasGateway,
    private readonly mp: MercadoPagoGateway,
    private readonly livepix: LivePixGateway,
    private readonly stripe: StripeGateway,
    private readonly settings: SettingsService,
    private readonly repo: PaymentsRepository,
    private readonly invoices: InvoicesService,
  ) {}

  async refund(externalChargeId: string, value?: number): Promise<void> {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) throw new NotFoundException('Cobrança não encontrada')
    const gateway = charge.gatewayName ?? charge.gateway_name

    if (gateway === 'mercadopago') {
      const cfg = await this.settings.getGatewayConfig()
      this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
      await this.mp.refundPayment(externalChargeId, value)
    } else if (gateway === 'livepix') {
      throw new BadRequestException(
        'A API da LivePix não disponibiliza estorno programático. O reembolso precisa ser feito manualmente pelo painel da LivePix.',
      )
    } else if (gateway === 'stripe') {
      const cfg = await this.settings.getGatewayConfig()
      this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)
      await this.stripe.refundPayment(externalChargeId, value)
    } else {
      await this.asaas.refundPayment(externalChargeId, value)
    }
    this.logger.log(`Reembolso solicitado: ${externalChargeId}`)
  }

  async cancelCharge(externalChargeId: string): Promise<void> {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) throw new NotFoundException('Cobrança não encontrada')
    const gateway = charge.gatewayName ?? charge.gateway_name

    if (gateway === 'mercadopago') {
      const cfg = await this.settings.getGatewayConfig()
      this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
      await this.mp.cancelCharge(externalChargeId)
    } else if (gateway === 'livepix') {
      throw new BadRequestException(
        'A API da LivePix não disponibiliza cancelamento programático de cobrança.',
      )
    } else if (gateway === 'stripe') {
      const cfg = await this.settings.getGatewayConfig()
      this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)
      await this.stripe.cancelCharge(externalChargeId)
    } else {
      await this.asaas.cancelCharge(externalChargeId)
    }
    this.logger.log(`Cobrança cancelada: ${externalChargeId}`)
  }

  async getCharge(externalChargeId: string) {
    const charge = await this.repo.findLatestChargeByExternalId(externalChargeId)
    if (!charge) throw new NotFoundException('Cobrança não encontrada')
    const gateway = charge.gatewayName ?? charge.gateway_name

    if (gateway === 'mercadopago') {
      const cfg = await this.settings.getGatewayConfig()
      this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
      return this.mp.getCharge(externalChargeId)
    }
    if (gateway === 'livepix') {
      const cfg = await this.settings.getGatewayConfig()
      this.livepix.setCredentials(cfg.livepix.clientId, cfg.livepix.clientSecret, cfg.livepix.scope)
      return this.livepix.getPayment(externalChargeId)
    }
    if (gateway === 'stripe') {
      const cfg = await this.settings.getGatewayConfig()
      this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)
      return this.stripe.getCheckoutSession(externalChargeId)
    }
    return this.asaas.getCharge(externalChargeId)
  }

  async listByOrigin(originType: string, originId: string) {
    const charges = await this.repo.listChargesByOrigin(originType, originId)
    for (const charge of charges) {
      const status = charge.status
      const gateway = charge.gatewayName ?? charge.gateway_name
      if (status === 'pending' && gateway === 'mercadopago') {
        await this.syncPendingMercadoPagoCharge(charge.externalChargeId ?? charge.external_charge_id)
      }
    }
    const normalized = await this.repo.listChargesByOrigin(originType, originId)
    return normalized.map((charge: any) => ({
      chargeId: charge.id,
      originType,
      originId,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      checkoutUrl: charge.checkoutUrl ?? charge.checkout_url ?? null,
      pixCode: charge.pixPayload ?? charge.pix_payload ?? null,
      pixQrCode: charge.pixQrCode ?? charge.pix_qr_code ?? null,
      externalChargeId: charge.externalChargeId ?? charge.external_charge_id ?? null,
      paidAt: charge.paidAt ?? charge.paid_at ?? null,
      createdAt: charge.createdAt ?? charge.created_at ?? null,
    }))
  }

  async syncPendingMercadoPagoChargesBatch(limit = 100): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    return this.syncPendingMercadoPagoChargesBatchThrottled(limit, 0)
  }

  async syncPendingMercadoPagoChargesBatchThrottled(
    limit = 20,
    delayMs = 350,
  ): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    const pending = await this.repo.listPendingMercadoPagoCharges(limit)
    if (pending.length === 0) {
      return { scanned: 0, paid: 0, failed: 0 }
    }

    const cfg = await this.settings.getGatewayConfig()
    this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)

    let paid = 0
    let failed = 0

    for (let index = 0; index < pending.length; index++) {
      const charge = pending[index]
      try {
        const result = await this.syncPendingMercadoPagoChargeWithConfiguredClient(charge.externalChargeId)
        if (result === 'paid') paid++
        if (result === 'failed') failed++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'erro desconhecido'
        this.logger.warn(`Falha ao sincronizar cobrança pendente ${charge.id}: ${message}`)
      }

      // Evita rajadas contra o gateway; mantém throughput constante e previsível.
      if (delayMs > 0 && index < pending.length - 1) {
        await this.sleep(delayMs)
      }
    }

    return {
      scanned: pending.length,
      paid,
      failed,
    }
  }

  private async syncPendingMercadoPagoCharge(externalChargeId: string): Promise<'paid' | 'failed' | 'pending'> {
    if (!externalChargeId) return 'pending'
    const cfg = await this.settings.getGatewayConfig()
    this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
    return this.syncPendingMercadoPagoChargeWithConfiguredClient(externalChargeId)
  }

  private async syncPendingMercadoPagoChargeWithConfiguredClient(
    externalChargeId: string,
  ): Promise<'paid' | 'failed' | 'pending'> {
    if (!externalChargeId) return 'pending'
    const remote = await this.mp.getCharge(externalChargeId)
    if (remote.status === 'approved') {
      await this.invoices.markPaid(String(remote.id), remote)
      return 'paid'
    }
    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(remote.status)) {
      await this.invoices.markFailed(String(remote.id), remote.status_detail ?? remote.status)
      return 'failed'
    }
    return 'pending'
  }

  // ── Stripe: sincronização de pendentes (rede de segurança caso o webhook falhe) ──
  //
  // A Stripe não tem hoje um mecanismo de confirmação além do webhook. Este job
  // espelha o do Mercado Pago: varre cobranças 'pending' e consulta a Checkout
  // Session diretamente na Stripe, confirmando (ou expirando) o pagamento mesmo
  // que o webhook nunca tenha chegado.

  async syncPendingStripeChargesBatch(limit = 100): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    return this.syncPendingStripeChargesBatchThrottled(limit, 0)
  }

  async syncPendingStripeChargesBatchThrottled(
    limit = 20,
    delayMs = 350,
  ): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    const pending = await this.repo.listPendingStripeCharges(limit)
    if (pending.length === 0) {
      return { scanned: 0, paid: 0, failed: 0 }
    }

    const cfg = await this.settings.getGatewayConfig()
    this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)

    let paid = 0
    let failed = 0

    for (let index = 0; index < pending.length; index++) {
      const charge = pending[index]
      try {
        const result = await this.syncPendingStripeChargeWithConfiguredClient(charge.externalChargeId)
        if (result === 'paid') paid++
        if (result === 'failed') failed++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'erro desconhecido'
        this.logger.warn(`Falha ao sincronizar cobrança Stripe pendente ${charge.id}: ${message}`)
      }

      // Evita rajadas contra o gateway; mantém throughput constante e previsível.
      if (delayMs > 0 && index < pending.length - 1) {
        await this.sleep(delayMs)
      }
    }

    return {
      scanned: pending.length,
      paid,
      failed,
    }
  }

  private async syncPendingStripeChargeWithConfiguredClient(
    externalChargeId: string,
  ): Promise<'paid' | 'failed' | 'pending'> {
    if (!externalChargeId) return 'pending'
    const session = await this.stripe.getCheckoutSession(externalChargeId)
    const status = StripeGateway.mapCheckoutSessionStatus(String(session.status ?? ''), session.payment_status ?? undefined)
    if (status === 'paid') {
      await this.invoices.markPaid(String(session.id), session)
      return 'paid'
    }
    if (status === 'canceled') {
      await this.invoices.markFailed(String(session.id), 'checkout_session_expired')
      return 'failed'
    }
    return 'pending'
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
