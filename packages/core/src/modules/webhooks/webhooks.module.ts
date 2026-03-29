import { Module } from '@nestjs/common'
import { WebhooksIngestService, WebhooksController, WebhookProcessorService } from './webhooks.service'
import { WebhookEventsRepository } from './webhook-events.repository'
import { InternalEventsModule } from './internal-events.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { LicensesModule } from '../licenses/licenses.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { SettingsModule } from '../settings/settings.module'
import { PaymentsModule } from '../payments/payments.module'

@Module({
  imports: [
    SubscriptionsModule,
    LicensesModule,
    InvoicesModule,
    InternalEventsModule,
    SettingsModule,
    PaymentsModule,
  ],
  controllers: [WebhooksController],
  providers: [
    WebhooksIngestService,
    WebhookProcessorService,
    WebhookEventsRepository,
  ],
  exports: [InternalEventsModule],
})
export class WebhooksModule {}
