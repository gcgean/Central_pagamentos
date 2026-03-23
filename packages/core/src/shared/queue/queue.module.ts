import { Module, Global } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { ConfigService } from '@nestjs/config'

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
          keyPrefix: config.get('REDIS_KEY_PREFIX', 'hub_billing:'),
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: 100, // mantém os 100 últimos falhos para debug
        },
      }),
    }),
    BullModule.registerQueue(
      { name: 'webhook-processing' },
      { name: 'internal-events' },
      { name: 'license-expiry' },
      { name: 'notifications' },
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}
