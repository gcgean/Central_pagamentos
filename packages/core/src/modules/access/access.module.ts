import { Module } from '@nestjs/common'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'
import { ExternalCustomersController } from './external-customers.controller'
import { ExternalCustomersService } from './external-customers.service'
import { ApiKeyGuard } from '../../shared/guards/api-key.guard'
import { LicensesModule } from '../licenses/licenses.module'
import { CustomersModule } from '../customers/customers.module'
import { ProductsModule } from '../products/products.module'
import { IntegrationsModule } from '../integrations/integrations.module'
import { PlansModule } from '../plans/plans.module'

@Module({
  imports: [LicensesModule, CustomersModule, ProductsModule, IntegrationsModule, PlansModule],
  controllers: [AccessController, ExternalCustomersController],
  providers: [AccessService, ExternalCustomersService, ApiKeyGuard],
})
export class AccessModule {}
