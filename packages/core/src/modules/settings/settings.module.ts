import { Module } from '@nestjs/common'
import { SettingsController } from './settings.controller'
import { SettingsService } from './settings.service'
import { SettingsRepository } from './settings.repository'
import { LivePixGateway } from '../payments/gateways/livepix.gateway'

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SettingsRepository, LivePixGateway],
  exports: [SettingsService],
})
export class SettingsModule {}
