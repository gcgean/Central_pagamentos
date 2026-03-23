import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class WebhookEventsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: {
    gatewayName: string
    eventType: string
    externalEventId: string
    payload: Record<string, unknown>
    signatureValid?: boolean
  }) {
    const [row] = await this.sql`
      INSERT INTO webhook_events (
        gateway_name, event_type, external_event_id,
        payload, signature_valid
      ) VALUES (
        ${data.gatewayName}, ${data.eventType}, ${data.externalEventId},
        ${JSON.stringify(data.payload)},
        ${data.signatureValid ?? null}
      )
      RETURNING *
    `
    return row
  }

  async findById(id: string) {
    const [row] = await this.sql`
      SELECT * FROM webhook_events WHERE id = ${id}
    `
    return row ?? null
  }

  async findByExternalId(gatewayName: string, externalEventId: string) {
    const [row] = await this.sql`
      SELECT * FROM webhook_events
      WHERE gateway_name = ${gatewayName}
        AND external_event_id = ${externalEventId}
    `
    return row ?? null
  }

  async markProcessed(id: string, result: Record<string, unknown>) {
    await this.sql`
      UPDATE webhook_events SET
        processed        = true,
        processed_at     = NOW(),
        processing_result = ${JSON.stringify(result)}
      WHERE id = ${id}
    `
  }

  async markFailed(id: string, errorMessage: string) {
    await this.sql`
      UPDATE webhook_events SET
        retry_count   = retry_count + 1,
        error_message = ${errorMessage}
      WHERE id = ${id}
    `
  }

  async findPending(limit = 100) {
    return this.sql`
      SELECT * FROM webhook_events
      WHERE processed = false
        AND retry_count < 5
      ORDER BY created_at ASC
      LIMIT ${limit}
    `
  }
}
