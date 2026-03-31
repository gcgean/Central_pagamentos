import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerModule } from '@nestjs/throttler'
import { appConfig } from './shared/config/app.config'
import { databaseConfig } from './shared/config/database.config'
import { CustomersModule } from './modules/customers/customers.module'
import { ProductsModule } from './modules/products/products.module'
import { PlansModule } from './modules/plans/plans.module'
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module'
import { OrdersModule } from './modules/orders/orders.module'
import { InvoicesModule } from './modules/invoices/invoices.module'
import { PaymentsModule } from './modules/payments/payments.module'
import { LicensesModule } from './modules/licenses/licenses.module'
import { WebhooksModule } from './modules/webhooks/webhooks.module'
import { IntegrationsModule } from './modules/integrations/integrations.module'
import { AdminModule } from './modules/admin/admin.module'
import { AccessModule } from './modules/access/access.module'
import { SettingsModule } from './modules/settings/settings.module'
import { HealthModule } from './modules/health/health.module'
import { DatabaseModule } from './shared/database/database.module'
import { QueueModule } from './shared/queue/queue.module'
import { AccessCacheModule } from './shared/cache/access-cache.module'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([{
      name: 'short',
      ttl: 1000,
      limit: 20,
    }, {
      name: 'long',
      ttl: 60000,
      limit: 300,
    }]),
    DatabaseModule,
    QueueModule,
    AccessCacheModule,
    CustomersModule,
    ProductsModule,
    PlansModule,
    SubscriptionsModule,
    OrdersModule,
    InvoicesModule,
    PaymentsModule,
    LicensesModule,
    WebhooksModule,
    IntegrationsModule,
    AdminModule,
    AccessModule,
    SettingsModule,
    HealthModule,
  ],
})
export class AppModule {}
