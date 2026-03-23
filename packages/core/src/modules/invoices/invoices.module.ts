import { Module, forwardRef } from '@nestjs/common'
import { InvoicesService } from './invoices.service'
import { InvoicesRepository } from './invoices.repository'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'
import { LicensesModule } from '../licenses/licenses.module'
import { OrdersModule } from '../orders/orders.module'

@Module({
  imports: [
    forwardRef(() => SubscriptionsModule),
    LicensesModule,
    OrdersModule,
  ],
  providers: [InvoicesService, InvoicesRepository],
  exports: [InvoicesService, InvoicesRepository],
})
export class InvoicesModule {}
