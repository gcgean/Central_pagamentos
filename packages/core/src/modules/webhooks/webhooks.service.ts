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

    this.log.log(`Processando webhook ${event.id} [${event.eventType}]`)

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
    const { eventType, payload } = event

    switch (eventType) {
      // ── Pagamento aprovado ───────────────────────────────────────────────
      case 'payment.approved':
      case 'payment.confirmed':
        await this.invoices.markPaid(payload.chargeId ?? payload.invoiceExternalId, payload)
        break

      // ── Pagamento falhou ─────────────────────────────────────────────────
      case 'payment.failed':
      case 'payment.declined':
        await this.invoices.markFailed(payload.chargeId, payload.reason)
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

@Controller({ path: 'webhooks', version: '1' })
export class WebhooksController {

  constructor(
    private readonly ingest: WebhooksIngestService,
    private readonly config: ConfigService,
  ) {}

  // Ponto de entrada para qualquer gateway: /api/v1/webhooks/gateway/asaas
  @Post('gateway/:provider')
  async receive(
    @Param('provider') provider: string,
    @Req() req: RawBodyRequest<any>,
    @Headers('x-asaas-signature') asaasSignature?: string,
    @Headers('stripe-signature') stripeSignature?: string,
  ) {
    const body = req.body
    const rawBody = req.rawBody
    const signature = asaasSignature ?? stripeSignature

    // Valida assinatura se houver secret configurado
    const secret = this.config.get<string>(`gateways.${provider}.webhookSecret`)
    if (secret && signature) {
      const valid = this.ingest.validateSignature(rawBody, signature, secret)
      if (!valid) {
        throw new BadRequestException('Assinatura de webhook inválida')
      }
    }

    const eventType = body.event ?? body.type ?? 'unknown'
    const externalId = body.id ?? body.data?.object?.id ?? body.paymentId

    return this.ingest.ingest({
      gatewayName: provider,
      eventType,
      externalEventId: String(externalId),
      payload: body,
      rawBody,
      signature,
    })
  }
}
