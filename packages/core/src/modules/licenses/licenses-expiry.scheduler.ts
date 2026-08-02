import { Injectable, Logger, Inject } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron, CronExpression } from '@nestjs/schedule'
import { LicensesService } from './licenses.service'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

// Rede de segurança para manter o status das licenças coerente no banco.
// O bloqueio de acesso em si já não depende disso — access.service.ts compara
// expiresAt na consulta —, mas relatórios e telas administrativas que olham
// license.status diretamente (sem passar por resolveAccess/getAccessStatus)
// continuariam contando licenças/trials vencidos como ativos sem este job.
@Injectable()
export class LicensesExpiryScheduler {

  private readonly logger = new Logger(LicensesExpiryScheduler.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly licenses: LicensesService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'licenses-expiry-sweep' })
  async sweepExpiredLicenses(): Promise<void> {
    const enabled = this.config.get<string>('LICENSES_EXPIRY_SWEEP_ENABLED', 'true') !== 'false'
    if (!enabled) return

    const lockId = Number(this.config.get<string>('LICENSES_EXPIRY_SWEEP_LOCK_ID', '918273647')) || 918273647
    const [lock] = await this.sql`SELECT pg_try_advisory_lock(${lockId}) AS locked`
    if (!lock?.locked) {
      this.logger.debug('Varredura de licenças vencidas ignorada: lock já em uso por outra instância')
      return
    }

    try {
      const paidCount = await this.licenses.expireOverdueLicenses()
      const trialCount = await this.licenses.expireOverdueTrials()
      if (paidCount > 0 || trialCount > 0) {
        this.logger.log(`Varredura de expiração concluída: licenças=${paidCount}, trials=${trialCount}`)
      }
    } finally {
      await this.sql`SELECT pg_advisory_unlock(${lockId})`
    }
  }
}
