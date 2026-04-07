import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { AsaasGateway } from './gateways/asaas.gateway'
import { MercadoPagoGateway } from './gateways/mercadopago.gateway'
import { PaymentsRepository } from './payments.repository'
import { SettingsService } from '../settings/settings.service'
import { InvoicesService } from '../invoices/invoices.service'

@Injectable()
export class PaymentsService {

  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly asaas: AsaasGateway,
    private readonly mp: MercadoPagoGateway,
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

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
