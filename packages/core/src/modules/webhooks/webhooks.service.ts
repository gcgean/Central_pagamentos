import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { createHmac, timingSafeEqual } from 'crypto'
import { WebhookEventsRepository } from './webhook-events.repository'

export interface InboundWebhook {
  gatewayName: string
  eventType: string
  externalEventId: string
  payload: Record<string, unknown>
  rawBody: Buffer
  signature?: string
}

@Injectable()
export class WebhooksIngestService {

  private readonly logger = new Logger(WebhooksIngestService.name)

  constructor(
    private readonly repo: WebhookEventsRepository,
    @InjectQueue('webhook-processing') private readonly queue: Queue,
  ) {}

  async ingest(data: InboundWebhook): Promise<{ received: boolean; eventId: string; duplicate: boolean }> {
    // 1. Idempotência — impede processamento duplicado
    const existing = await this.repo.findByExternalId(data.gatewayName, data.externalEventId)

    if (existing) {
      this.logger.warn(`Webhook duplicado ignorado: ${data.gatewayName}::${data.externalEventId}`)
      return { received: true, eventId: existing.id, duplicate: true }
    }

    // 2. Salva o evento ANTES de processar (garante que não se perde)
    const event = await this.repo.create({
      gatewayName: data.gatewayName,
      eventType: data.eventType,
      externalEventId: data.externalEventId,
      payload: data.payload,
      signatureValid: true, // validado antes de chegar aqui
    })

    // 3. Enfileira para processamento assíncrono
    await this.queue.add('process-webhook', { eventId: event.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
    })

    this.logger.log(`Webhook recebido e enfileirado: ${event.id} [${data.eventType}]`)

    return { received: true, eventId: event.id, duplicate: false }
  }

  // Validação de assinatura HMAC (Asaas, Stripe, etc.)
  validateSignature(rawBody: Buffer, signature: string, secret: string): boolean {
    try {
      const expected = createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex')

      const expectedBuf = Buffer.from(expected, 'hex')
      const receivedBuf = Buffer.from(signature.replace('sha256=', ''), 'hex')

      if (expectedBuf.length !== receivedBuf.length) return false

      // timingSafeEqual previne timing attacks
      return timingSafeEqual(expectedBuf, receivedBuf)
    } catch {
      return false
    }
  }
}

// ── webhook-processor.service.ts ─────────────────────────────────────────────
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { SubscriptionsService } from '../subscriptions/subscriptions.service'
import { LicensesService } from '../licenses/licenses.service'
import { InvoicesService } from '../invoices/invoices.service'

@Processor('webhook-processing')
export class WebhookProcessorService extends WorkerHost {

  private readonly log = new Logger(WebhookProcessorService.name)

  constructor(
    private readonly repo: WebhookEventsRepository,
    private readonly subscriptions: SubscriptionsService,
    private readonly licenses: LicensesService,
    private readonly invoices: InvoicesService,
  ) {
    super()
  }

  async process(job: Job<{ eventId: string }>) {
    const event = await this.repo.findById(job.data.eventId)
    if (!event || event.processed) return
    const eventType = event.eventType ?? event.event_type

    this.log.log(`Processando webhook ${event.id} [${eventType}]`)

    try {
      await this.dispatch(event)
      await this.repo.markProcessed(event.id, { success: true })
    } catch (err) {
      this.log.error(`Erro ao processar webhook ${event.id}:`, err)
      await this.repo.markFailed(event.id, err.message)
      throw err // BullMQ fará retry conforme configurado
    }
  }

  private async dispatch(event: any) {
    const eventType = event.eventType ?? event.event_type
    const payload = event.payload

    switch (eventType) {
      // ── Pagamento aprovado ───────────────────────────────────────────────
      case 'payment.approved':
      case 'payment.confirmed':
        await this.invoices.markPaid(
          String(payload?.chargeId ?? payload?.invoiceExternalId ?? payload?.data?.id ?? payload?.charge?.id),
          payload?.charge ?? payload,
        )
        break

      // ── Pagamento falhou ─────────────────────────────────────────────────
      case 'payment.failed':
      case 'payment.declined':
        await this.invoices.markFailed(
          String(payload?.chargeId ?? payload?.data?.id ?? payload?.charge?.id),
          payload?.reason ?? payload?.status_detail ?? 'Falha no pagamento',
        )
        break

      // ── Assinatura cancelada pelo gateway ────────────────────────────────
      case 'subscription.canceled':
        await this.subscriptions.cancelByExternal(payload.externalSubscriptionId)
        break

      // ── Chargeback ───────────────────────────────────────────────────────
      case 'payment.chargeback':
        await this.invoices.handleChargeback(payload.chargeId)
        break

      // ── Pix expirado ─────────────────────────────────────────────────────
      case 'pix.expired':
        await this.invoices.markChargeExpired(payload.chargeId)
        break

      default:
        this.log.warn(`Tipo de evento não mapeado: ${eventType}`)
    }
  }
}

// ── webhooks.controller.ts ────────────────────────────────────────────────────
import { Controller, Post, Param, Req, Headers, RawBodyRequest } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { MercadoPagoGateway } from '../payments/gateways/mercadopago.gateway'
import { SettingsService } from '../settings/settings.service'

@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {

  constructor(
    private readonly ingest: WebhooksIngestService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly mp: MercadoPagoGateway,
  ) {}

  // Ponto de entrada para qualquer gateway: /api/v1/webhooks/gateway/asaas
  @Post('gateway/:provider')
  async receive(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<any>,
    @Headers('x-asaas-signature') asaasSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('x-signature') mpSignature?: string,
    @Headers('x-request-id') mpRequestId?: string,
  ) {
    const body = req.body
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}))
    const signature = mpSignature ?? asaasSignature ?? stripeSignature

    if (provider === 'mercadopago') {
      const cfg = await this.settings.getGatewayConfig()
      const dataId = String(body?.data?.id ?? body?.id ?? '')
      if (cfg.mercadopago.webhookSecret && mpSignature && mpRequestId && dataId) {
        this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
        const valid = this.mp.validateWebhookSignature(mpSignature, mpRequestId, dataId)
        if (!valid) {
          throw new BadRequestException('Assinatura de webhook inválida')
        }
      }
    } else {
      const secret = this.config.get<string>(`gateways.${provider}.webhookSecret`)
      if (secret && signature) {
        const valid = this.ingest.validateSignature(rawBody, signature, secret)
        if (!valid) {
          throw new BadRequestException('Assinatura de webhook inválida')
        }
      }
    }

    let eventType =
      provider === 'mercadopago'
        ? (body.action ?? body.type ?? 'unknown')
        : (body.event ?? body.type ?? 'unknown')
    const externalId =
      provider === 'mercadopago'
        ? (body.data?.id ?? body.id ?? body.paymentId)
        : (body.id ?? body.data?.object?.id ?? body.paymentId)

    let payload = body
    if (provider === 'mercadopago' && eventType === 'payment.updated' && externalId) {
      const cfg = await this.settings.getGatewayConfig()
      this.mp.setCredentials(cfg.mercadopago.accessToken, cfg.mercadopago.webhookSecret)
      const charge = await this.mp.getCharge(String(externalId))
      payload = { ...body, charge }
      if (charge.status === 'approved') eventType = 'payment.approved'
      else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(charge.status)) eventType = 'payment.failed'
    }

    return this.ingest.ingest({
      gatewayName: provider,
      eventType,
      externalEventId: String(externalId),
      payload,
      rawBody,
      signature,
    })
  }
}
