import { Module } from '@nestjs/common'
import { LicensesController } from './licenses.controller'
import { LicensesService } from './licenses.service'
import { LicensesRepository } from './licenses.repository'
import { LicensesExpiryScheduler } from './licenses-expiry.scheduler'
import { AdminModule } from '../admin/admin.module'
import { InternalEventsModule } from '../webhooks/internal-events.module'

@Module({
  imports: [AdminModule, InternalEventsModule],
  controllers: [LicensesController],
  providers: [LicensesService, LicensesRepository, LicensesExpiryScheduler],
  exports: [LicensesService],
})
export class LicensesModule {}
