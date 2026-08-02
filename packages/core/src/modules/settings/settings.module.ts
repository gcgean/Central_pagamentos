import { Module } from '@nestjs/common'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { SettingsRepository } from './settings.repository'
import { LivePixGateway } from '../payments/gateways/livepix.gateway'
import { StripeGateway } from '../payments/gateways/stripe.gateway'

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository, LivePixGateway, StripeGateway],
  exports: [SettingsService],
})
export class SettingsModule {}
