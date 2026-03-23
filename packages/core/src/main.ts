import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const logger = new Logger('Bootstrap')

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bufferLogs: true },
  )

  const config = app.get(ConfigService)
  const port = config.get<number>('app.port', 3000)
  const env = config.get<string>('app.env', 'development')

  // Versionamento de API
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })

  // Validação global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }))

  // CORS
  app.enableCors({
    origin: config.get<string[]>('app.corsOrigins', ['http://localhost:3001']),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  })

  // Swagger (somente fora de produção)
  if (env !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hub Billing API')
      .setDescription('Hub Central de Billing, Pagamentos e Licenciamento')
      .setVersion('1.0')
      .addBearerAuth()
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
      .addTag('customers', 'Gestão de clientes')
      .addTag('products', 'Produtos e planos')
      .addTag('subscriptions', 'Assinaturas recorrentes')
      .addTag('orders', 'Pedidos avulsos')
      .addTag('licenses', 'Licenças de uso')
      .addTag('access', 'Validação de acesso — sistemas satélites')
      .addTag('webhooks', 'Recebimento de webhooks')
      .addTag('admin', 'Painel administrativo')
      .build()

    const document = SwaggerModule.createDocument(app, swaggerConfig)
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    })

    logger.log(`Swagger disponível em http://localhost:${port}/docs`)
  }

  // Prefixo global
  app.setGlobalPrefix('api')

  await app.listen(port, '0.0.0.0')
  logger.log(`Hub Billing rodando na porta ${port} [${env}]`)
}

bootstrap().catch((err) => {
  console.error('Erro fatal ao inicializar:', err)
  process.exit(1)
})
