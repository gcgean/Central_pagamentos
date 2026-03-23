import { Module } from '@nestjs/common'
import { LicensesController } from './licenses.controller'
import { LicensesService } from './licenses.service'
import { LicensesRepository } from './licenses.repository'
import { AdminModule } from '../admin/admin.module'
import { InternalEventsModule } from '../webhooks/internal-events.module'

@Module({
  imports: [AdminModule, InternalEventsModule],
  controllers: [LicensesController],
  providers: [LicensesService, LicensesRepository],
  exports: [LicensesService],
})
export class LicensesModule {}
