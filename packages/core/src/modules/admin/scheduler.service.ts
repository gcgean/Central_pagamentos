import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { LicensesService } from '../licenses/licenses.service'
import { InjectQueue } from '@nestjs/bullmq'
import { Queue } from 'bullmq'
import dayjs from 'dayjs'

@Injectable()
export class SchedulerService {

  private readonly logger = new Logger(SchedulerService.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly licenses: LicensesService,
    @InjectQueue('internal-events') private readonly eventsQueue: Queue,
  ) {}

  // Roda todo dia às 2h — suspende licenças expiradas após carência
  @Cron('0 2 * * *', { name: 'license-expiry' })
  async processExpiredLicenses() {
    this.logger.log('Iniciando processamento de licenças expiradas...')
    const count = await this.licenses.expireOverdueLicenses()
    this.logger.log(`Processamento concluído: ${count} licenças suspensas`)
  }

  // Roda a cada hora — reprocessa internal_events falhos
  @Cron(CronExpression.EVERY_HOUR, { name: 'retry-internal-events' })
  async retryFailedInternalEvents() {
    const failed = await this.sql`
      SELECT id FROM internal_events
      WHERE delivered = false
        AND retry_count < 10
        AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '1 hour')
      LIMIT 50
    `

    if (failed.length === 0) return

    this.logger.log(`Reenfileirando ${failed.length} eventos internos não entregues`)

    for (const event of failed) {
      await this.eventsQueue.add('deliver-event', { eventId: event.id }, {
        attempts: 3,
        backoff: { type: 'fixed', delay: 5000 },
      })
    }
  }

  // Roda a cada 30 minutos — verifica cobranças com Pix expirado
  @Cron('*/30 * * * *', { name: 'pix-expiry' })
  async processExpiredPixCharges() {
    const expired = await this.sql`
      UPDATE charges
      SET status = 'canceled'
      WHERE status = 'pending'
        AND payment_method = 'pix'
        AND pix_expires_at < NOW()
      RETURNING id
    `
    if (expired.length > 0) {
      this.logger.log(`${expired.length} cobranças Pix expiradas canceladas`)
    }
  }

  // Roda todo dia às 9h — alerta de assinaturas vencendo em 7 dias
  @Cron('0 9 * * *', { name: 'renewal-reminders' })
  async sendRenewalReminders() {
    const expiringSoon = await this.sql`
      SELECT
        s.id AS subscription_id,
        c.email,
        c.legal_name,
        p.name AS product_name,
        s.current_period_end
      FROM subscriptions s
      JOIN customers c ON c.id = s.customer_id
      JOIN products p ON p.id = s.product_id
      WHERE s.status = 'active'
        AND s.current_period_end BETWEEN NOW() AND NOW() + INTERVAL '7 days'
    `

    this.logger.log(`${expiringSoon.length} lembretes de renovação a enviar`)
    // TODO: integrar com serviço de notificações (email, WhatsApp, etc.)
  }

  // Roda todo dia às 3h — verifica assinaturas overdue sem tentativa de retry
  @Cron('0 3 * * *', { name: 'overdue-retry' })
  async scheduleOverdueRetries() {
    const pending = await this.sql`
      SELECT c.id, c.invoice_id, c.next_retry_at
      FROM charges c
      JOIN invoices i ON i.id = c.invoice_id
      WHERE c.status = 'failed'
        AND c.attempt_number < c.max_attempts
        AND c.next_retry_at <= NOW()
        AND i.status = 'open'
    `

    this.logger.log(`${pending.length} cobranças elegíveis para retry`)

    // Enfileira reprocessamento — cada charge será reprocessado individualmente
    for (const charge of pending) {
      await this.sql`
        UPDATE charges SET status = 'pending', next_retry_at = NULL
        WHERE id = ${charge.id}
      `
      // TODO: criar nova tentativa de cobrança no gateway
    }
  }
}
