import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import axios from 'axios'
import { createHmac } from 'crypto'

export interface DispatchEventParams {
  productId: string
  customerId: string
  eventType: string
  payload: Record<string, unknown>
}

@Injectable()
export class InternalEventsService {

  private readonly logger = new Logger(InternalEventsService.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    @InjectQueue('internal-events') private readonly queue: Queue,
  ) {}

  async dispatch(params: DispatchEventParams): Promise<void> {
    // Persiste o evento
    const [event] = await this.sql`
      INSERT INTO internal_events (
        product_id, customer_id, event_type, payload
      ) VALUES (
        ${params.productId}, ${params.customerId},
        ${params.eventType}, ${this.sql.json(params.payload as any)}
      )
      RETURNING id
    `

    // Enfileira entrega
    await this.queue.add('deliver-event', { eventId: event.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 3000 },
    })
  }

  // Worker que entrega o evento ao sistema satélite via HTTP POST
  async deliver(eventId: string): Promise<void> {
    const [event] = await this.sql`
      SELECT
        ie.*,
        p.webhook_url,
        p.webhook_secret
      FROM internal_events ie
      JOIN products p ON p.id = ie.product_id
      WHERE ie.id = ${eventId}
    `

    if (!event || event.delivered) return

    if (!event.webhook_url) {
      this.logger.warn(`Produto ${event.product_id} sem webhook_url configurada. Evento ${eventId} ignorado.`)
      await this.sql`
        UPDATE internal_events SET delivered = true, delivered_at = NOW() WHERE id = ${eventId}
      `
      return
    }

    const body = {
      id: event.id,
      type: event.event_type,
      productId: event.product_id,
      customerId: event.customer_id,
      payload: event.payload,
      createdAt: event.created_at,
    }

    const bodyStr = JSON.stringify(body)

    // Assina com HMAC para o satélite poder validar
    const signature = event.webhook_secret
      ? createHmac('sha256', event.webhook_secret).update(bodyStr).digest('hex')
      : undefined

    try {
      const res = await axios.post(event.webhook_url, body, {
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature': signature ? `sha256=${signature}` : undefined,
          'X-Hub-Event': event.event_type,
        },
      })

      await this.sql`
        UPDATE internal_events SET
          delivered = true,
          delivered_at = NOW(),
          http_status = ${res.status},
          response_body = ${JSON.stringify(res.data).slice(0, 1000)},
          retry_count = retry_count + 1,
          last_attempt_at = NOW()
        WHERE id = ${eventId}
      `

      this.logger.log(`Evento entregue: ${event.event_type} → ${event.webhook_url} [${res.status}]`)

    } catch (err) {
      await this.sql`
        UPDATE internal_events SET
          retry_count = retry_count + 1,
          last_attempt_at = NOW(),
          http_status = ${err.response?.status ?? null},
          response_body = ${String(err.message).slice(0, 1000)}
        WHERE id = ${eventId}
      `
      throw err // BullMQ fará retry
    }
  }
}
