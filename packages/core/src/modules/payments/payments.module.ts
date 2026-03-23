import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { CheckoutService } from './checkout.service'
import { PaymentsRepository } from './payments.repository'
import { AsaasGateway } from './gateways/asaas.gateway'
import { LicensesModule } from '../licenses/licenses.module'
import { PlansModule } from '../plans/plans.module'
import { ProductsModule } from '../products/products.module'
import { CustomersModule } from '../customers/customers.module'

@Module({
  imports: [LicensesModule, PlansModule, ProductsModule, CustomersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    CheckoutService,
    PaymentsRepository,
    AsaasGateway,
  ],
  exports: [PaymentsService, CheckoutService],
})
export class PaymentsModule {}
