import { Module } from '@nestjs/common'
import { WebhooksIngestService, WebhooksController, WebhookProcessorService } from './webhooks.service'
import { WebhookEventsRepository } from './webhook-events.repository'
import { InternalEventsModule } from './internal-events.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { LicensesModule } from '../licenses/licenses.module'
import { InvoicesModule } from '../invoices/invoices.module'

@Module({
  imports: [SubscriptionsModule, LicensesModule, InvoicesModule, InternalEventsModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksIngestService,
    WebhookProcessorService,
    WebhookEventsRepository,
  ],
  exports: [InternalEventsModule],
})
export class WebhooksModule {}
