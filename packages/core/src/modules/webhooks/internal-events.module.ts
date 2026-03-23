import { Module } from '@nestjs/common'
import { InternalEventsService } from './internal-events.service'

@Module({
  providers: [InternalEventsService],
  exports: [InternalEventsService],
})
export class InternalEventsModule {}
