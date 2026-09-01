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
          // ATENÇÃO: NÃO usar `keyPrefix` aqui. O BullMQ não suporta o
          // keyPrefix do ioredis: os comandos comuns saem prefixados, mas os
          // scripts Lua do próprio BullMQ montam os nomes de chave por conta
          // e ficam SEM o prefixo. O resultado é a fila num namespace e os
          // dados dos jobs em outro — foi isso que gerou o loop infinito de
          // "Missing key for job N" queimando CPU em produção.
          // Para namespacing, use a opção `prefix` do BullMQ, logo abaixo.
        },
        // Prefixo do BullMQ (substitui o padrão "bull"). Sem os dois-pontos:
        // o BullMQ já junta as partes com ":".
        prefix: config.get('REDIS_KEY_PREFIX', 'hub_billing').replace(/:+$/, ''),
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
