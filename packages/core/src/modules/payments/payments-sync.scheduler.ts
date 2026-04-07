import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { PaymentsService } from './payments.service'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class PaymentsSyncScheduler {

  private readonly logger = new Logger(PaymentsSyncScheduler.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'payments-pending-sync' })
  async syncPendingCharges(): Promise<void> {
    const enabled = this.config.get<string>('PAYMENTS_PENDING_SYNC_ENABLED', 'true') !== 'false'
    if (!enabled) return

    // Lock em nível de banco para evitar concorrência entre múltiplas instâncias do Hub.
    const lockId = Number(this.config.get<string>('PAYMENTS_PENDING_SYNC_LOCK_ID', '918273645')) || 918273645
    const [lock] = await this.sql`SELECT pg_try_advisory_lock(${lockId}) AS locked`
    if (!lock?.locked) {
      this.logger.debug('Sincronização de pendentes ignorada: lock já em uso por outra instância')
      return
    }

    try {
      const batchSize = Number(this.config.get<string>('PAYMENTS_PENDING_SYNC_BATCH', '20')) || 20
      const delayMs = Number(this.config.get<string>('PAYMENTS_PENDING_SYNC_DELAY_MS', '350')) || 350
      const result = await this.payments.syncPendingMercadoPagoChargesBatchThrottled(batchSize, delayMs)

      if (result.scanned > 0) {
        this.logger.log(
          `Sincronização de pendentes concluída: varridas=${result.scanned}, pagas=${result.paid}, falhas=${result.failed}, delayMs=${delayMs}`,
        )
      }
    } finally {
      await this.sql`SELECT pg_advisory_unlock(${lockId})`
    }
  }
}
