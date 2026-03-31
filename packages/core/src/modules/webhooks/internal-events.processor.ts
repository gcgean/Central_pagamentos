import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Job } from 'bullmq'
import { Logger } from '@nestjs/common'
import { InternalEventsService } from './internal-events.service'

@Processor('internal-events')
export class InternalEventsProcessor extends WorkerHost {
  private readonly logger = new Logger(InternalEventsProcessor.name)

  constructor(private readonly internalEvents: InternalEventsService) {
    super()
  }

  async process(job: Job<{ eventId: string }>): Promise<void> {
    const eventId = job.data?.eventId
    if (!eventId) return

    this.logger.log(`Processando internal event ${eventId}`)
    await this.internalEvents.deliver(eventId)
  }
}
