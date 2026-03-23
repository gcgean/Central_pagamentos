import { Module } from '@nestjs/common'
import { PaymentsController } from './payments.controller'
import { PaymentsService } from './payments.service'
import { CheckoutService } from './checkout.service'
import { PaymentsRepository } from './payments.repository'
import { AsaasGateway } from './gateways/asaas.gateway'
import { LicensesModule } from '../licenses/licenses.module'
import { SubscriptionsModule } from '../subscriptions/subscriptions.module'

@Module({
  imports: [LicensesModule, SubscriptionsModule],
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
