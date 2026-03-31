import { Module } from '@nestjs/common'
import { InternalEventsService } from './internal-events.service'
import { InternalEventsProcessor } from './internal-events.processor'

@Module({
  providers: [InternalEventsService, InternalEventsProcessor],
  exports: [InternalEventsService],
})
export class InternalEventsModule {}
