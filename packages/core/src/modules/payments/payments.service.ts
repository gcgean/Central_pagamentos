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

  /**
   * Cancela a assinatura recorrente nativa do gateway (ex: Stripe Subscriptions),
   * parando as cobranças automáticas futuras no cartão salvo. Chamado pelo
   * SubscriptionsService.cancel() antes de marcar como cancelado localmente —
   * sem isso, cancelar no Hub não impede o gateway de continuar cobrando.
   *
   * Sem gatewayName/externalSubscriptionId = nada a cancelar no gateway (ex:
   * assinatura cobrada manualmente ciclo a ciclo, sem assinatura nativa).
   */
  async cancelRecurringSubscription(
    gatewayName: string | null | undefined,
    externalSubscriptionId: string | null | undefined,
  ): Promise<void> {
    if (!gatewayName || !externalSubscriptionId) return

    if (gatewayName === 'stripe') {
      const cfg = await this.settings.getGatewayConfig()
      this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)
      try {
        await this.stripe.cancelSubscription(externalSubscriptionId)
      } catch (err: any) {
        const msg = String(err?.message ?? '').toLowerCase()
        // Idempotente: se já foi cancelada (ex: pelo próprio webhook
        // customer.subscription.deleted) ou não existe mais, não é erro.
        if (msg.includes('already') || msg.includes('no such subscription') || msg.includes('canceled')) {
          this.logger.warn(`Assinatura Stripe ${externalSubscriptionId} já cancelada/inexistente — ignorado.`)
          return
        }
        throw err
      }
      this.logger.log(`Assinatura recorrente cancelada no gateway: stripe ${externalSubscriptionId}`)
      return
    }

    if (gatewayName === 'mercadopago') {
      const cfg = await this.settings.getGatewayConfig()
      this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
      await this.mp.cancelSubscription(externalSubscriptionId)
      this.logger.log(`Assinatura recorrente cancelada no gateway: mercadopago ${externalSubscriptionId}`)
      return
    }

    if (gatewayName === 'asaas') {
      await this.asaas.cancelSubscription(externalSubscriptionId)
      this.logger.log(`Assinatura recorrente cancelada no gateway: asaas ${externalSubscriptionId}`)
      return
    }

    if (gatewayName === 'livepix') {
      throw new BadRequestException(
        'A API da LivePix não disponibiliza cancelamento programático de assinatura. Cancele manualmente pelo painel da LivePix — os dados locais foram atualizados, mas a cobrança recorrente lá pode continuar até você cancelar por lá.',
      )
    }
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

  // ── LivePix: sincronização de pendentes (rede de segurança caso o webhook falhe) ──
  //
  // A confirmação de um PIX da LivePix chega só por webhook. Em 15/09/2026 a
  // LivePix ficou ~1h sem entregar nenhum aviso (o log do nginx não registrou
  // uma única chamada dela no período, e todas as anteriores tinham respondido
  // 201): quem pagou nesse intervalo ficou preso em 'pending' e nunca recebeu
  // acesso, sem nenhum caminho de recuperação — o botão "Já paguei — verificar"
  // do produto só relê o status que o Hub já gravou.
  //
  // Este job espelha o da Stripe: varre as cobranças pendentes e pergunta à
  // própria LivePix se aquele pagamento existe.
  //
  // Regra de ouro: só marca como paga com EVIDÊNCIA POSITIVA. Resposta ausente,
  // 404 ou formato inesperado contam como "ainda não pagou" — o erro de deixar
  // alguém esperando o webhook chegar é reversível; o de liberar acesso para
  // quem só gerou o PIX não é.
  async syncPendingLivePixChargesBatch(limit = 100): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    return this.syncPendingLivePixChargesBatchThrottled(limit, 0)
  }

  async syncPendingLivePixChargesBatchThrottled(
    limit = 20,
    delayMs = 700,
    maxAgeHours = 24,
  ): Promise<{
    scanned: number
    paid: number
    failed: number
  }> {
    // A LivePix limita por endpoint e o 429 dela é caro (uso abusivo pode custar
    // a conta). Se já estamos em cooldown, nem começa.
    if (this.livepix.rateLimited) {
      this.logger.warn('Sincronização LivePix adiada: em cooldown de rate limit')
      return { scanned: 0, paid: 0, failed: 0 }
    }

    const pending = await this.repo.listPendingLivePixCharges(limit, maxAgeHours)
    if (pending.length === 0) {
      return { scanned: 0, paid: 0, failed: 0 }
    }

    const cfg = await this.settings.getGatewayConfig()
    this.livepix.setCredentials(cfg.livepix.clientId, cfg.livepix.clientSecret, cfg.livepix.scope)

    // Uma chamada resolve o lote inteiro: a lista de recebidos vem do mais novo
    // para o mais antigo, e é nela que procuramos a reference de cada pendente.
    let recebidos: any[]
    try {
      recebidos = await this.livepix.listReceivedPayments(1, Math.max(pending.length * 2, 50))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      this.logger.warn(`Falha ao listar pagamentos recebidos na LivePix: ${message}`)
      return { scanned: pending.length, paid: 0, failed: 0 }
    }

    const porReference = new Map<string, any>()
    for (const recebido of recebidos) {
      const reference = String(recebido?.reference ?? '').trim()
      if (reference) porReference.set(reference, recebido)
    }

    let paid = 0
    for (const charge of pending) {
      const recebido = porReference.get(charge.externalChargeId)
      if (!recebido) continue
      try {
        // Mesma chave que o webhook usa (payload.chargeId = resource.reference),
        // para que os dois caminhos resolvam a mesma cobrança.
        await this.invoices.markPaid(charge.externalChargeId, recebido)
        paid++
        this.logger.log(
          `Cobrança LivePix ${charge.externalChargeId} confirmada por sincronização (webhook não chegou)`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'erro desconhecido'
        this.logger.warn(`Falha ao confirmar cobrança LivePix ${charge.id}: ${message}`)
      }
      if (delayMs > 0) await this.sleep(delayMs)
    }

    // Enquanto não há confirmação, registra uma vez o tamanho do que a LivePix
    // devolveu: sem isso, "nada foi pago" e "a consulta não trouxe nada" ficam
    // indistinguíveis no log, que foi exatamente o que atrapalhou o diagnóstico.
    if (paid === 0 && Date.now() - this.livePixUltimoResumoEmMs > 10 * 60 * 1000) {
      this.livePixUltimoResumoEmMs = Date.now()
      this.logger.log(
        `LivePix: ${pending.length} pendente(s) local(is), ${recebidos.length} pagamento(s) recebido(s) na consulta, nenhuma correspondência`,
      )
    }

    // Não há 'failed' aqui: a LivePix não expõe cobrança recusada ou expirada,
    // então nada é marcado como falho por este caminho.
    return { scanned: pending.length, paid, failed: 0 }
  }

  private livePixUltimoResumoEmMs = 0

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
