import { Module, forwardRef } from '@nestjs/common'
import { SubscriptionsController, OrdersController } from './subscriptions.controller'
import { SubscriptionsService } from './subscriptions.service'
import { SubscriptionsRepository } from './subscriptions.repository'
import { LicensesModule } from '../licenses/licenses.module'
import { InvoicesModule } from '../invoices/invoices.module'
import { AdminModule } from '../admin/admin.module'
import { PaymentsModule } from '../payments/payments.module'
import { OrdersModule } from '../orders/orders.module'

@Module({
  imports: [LicensesModule, forwardRef(() => InvoicesModule), AdminModule, PaymentsModule, OrdersModule],
  controllers: [SubscriptionsController, OrdersController],
  providers: [SubscriptionsService, SubscriptionsRepository],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
