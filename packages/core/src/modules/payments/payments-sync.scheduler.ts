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

  // Rede de segurança para a Stripe: hoje a confirmação de pagamento depende só
  // do webhook (sem fallback nativo, ao contrário do Mercado Pago). Este job
  // varre cobranças pendentes e consulta a Checkout Session diretamente na
  // Stripe, evitando que um pagamento real fique preso em "pendente" se o
  // webhook falhar ou nunca chegar. Lock separado do MP para não competir.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'stripe-pending-sync' })
  async syncPendingStripeCharges(): Promise<void> {
    const enabled = this.config.get<string>('STRIPE_PENDING_SYNC_ENABLED', 'true') !== 'false'
    if (!enabled) return

    const lockId = Number(this.config.get<string>('STRIPE_PENDING_SYNC_LOCK_ID', '918273646')) || 918273646
    const [lock] = await this.sql`SELECT pg_try_advisory_lock(${lockId}) AS locked`
    if (!lock?.locked) {
      this.logger.debug('Sincronização Stripe de pendentes ignorada: lock já em uso por outra instância')
      return
    }

    try {
      const batchSize = Number(this.config.get<string>('STRIPE_PENDING_SYNC_BATCH', '20')) || 20
      const delayMs = Number(this.config.get<string>('STRIPE_PENDING_SYNC_DELAY_MS', '350')) || 350
      const result = await this.payments.syncPendingStripeChargesBatchThrottled(batchSize, delayMs)

      if (result.scanned > 0) {
        this.logger.log(
          `Sincronização Stripe de pendentes concluída: varridas=${result.scanned}, pagas=${result.paid}, falhas=${result.failed}, delayMs=${delayMs}`,
        )
      }
    } finally {
      await this.sql`SELECT pg_advisory_unlock(${lockId})`
    }
  }

  // Rede de segurança para a LivePix: a confirmação do PIX depende só do webhook
  // dela, e em 15/09/2026 essa entrega parou por ~1h — quem pagou no intervalo
  // ficou preso em "pendente" para sempre. Este job consulta a própria LivePix e
  // confirma o pagamento mesmo que o aviso nunca chegue.
  //
  // O ritmo é mais folgado que o do MP/Stripe (lote menor, pausa maior): a
  // LivePix limita por endpoint, o 429 dela entra em cooldown e uso abusivo pode
  // custar a conta. Lock separado, para não competir com os outros dois.
  @Cron(CronExpression.EVERY_MINUTE, { name: 'livepix-pending-sync' })
  async syncPendingLivePixCharges(): Promise<void> {
    const enabled = this.config.get<string>('LIVEPIX_PENDING_SYNC_ENABLED', 'true') !== 'false'
    if (!enabled) return

    const lockId = Number(this.config.get<string>('LIVEPIX_PENDING_SYNC_LOCK_ID', '918273647')) || 918273647
    const [lock] = await this.sql`SELECT pg_try_advisory_lock(${lockId}) AS locked`
    if (!lock?.locked) {
      this.logger.debug('Sincronização LivePix de pendentes ignorada: lock já em uso por outra instância')
      return
    }

    try {
      const batchSize = Number(this.config.get<string>('LIVEPIX_PENDING_SYNC_BATCH', '10')) || 10
      const delayMs = Number(this.config.get<string>('LIVEPIX_PENDING_SYNC_DELAY_MS', '700')) || 700
      const maxAgeHours = Number(this.config.get<string>('LIVEPIX_PENDING_SYNC_MAX_AGE_HOURS', '24')) || 24
      const result = await this.payments.syncPendingLivePixChargesBatchThrottled(batchSize, delayMs, maxAgeHours)

      if (result.paid > 0) {
        this.logger.log(
          `Sincronização LivePix de pendentes concluída: varridas=${result.scanned}, pagas=${result.paid}, delayMs=${delayMs}`,
        )
      }
    } finally {
      await this.sql`SELECT pg_advisory_unlock(${lockId})`
    }
  }
}
