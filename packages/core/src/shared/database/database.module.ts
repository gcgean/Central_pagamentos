import { Module, Global } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import postgres from 'postgres'

export const DATABASE_CONNECTION = 'DATABASE_CONNECTION'

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('DATABASE_URL')
        return postgres(url, {
          max: config.get<number>('DATABASE_POOL_MAX', 10),
          idle_timeout: 30,
          connect_timeout: 10,
          transform: { undefined: null },
          onnotice: () => {}, // silencia NOTICEs de migration
        })
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
