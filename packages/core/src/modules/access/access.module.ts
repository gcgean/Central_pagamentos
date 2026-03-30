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

@Module({
  imports: [LicensesModule, CustomersModule, ProductsModule, IntegrationsModule],
  controllers: [AccessController, ExternalCustomersController],
  providers: [AccessService, ExternalCustomersService, ApiKeyGuard],
})
export class AccessModule {}
