import {
  Controller, Get, Put, Post, Body, UseGuards, BadRequestException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { IsOptional, IsString, IsIn, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { SettingsService, ActiveGateway } from './settings.service'
import { LivePixGateway } from '../payments/gateways/livepix.gateway'
import { StripeGateway } from '../payments/gateways/stripe.gateway'

// ── DTOs ──────────────────────────────────────────────────────────────────────

class MercadoPagoCredentialsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accessToken?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  publicKey?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  webhookSecret?: string
}

class AsaasCredentialsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  apiKey?: string
}

class LivePixCredentialsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientId?: string

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  clientSecret?: string

  @ApiProperty({ required: false, description: 'Scopes da aplicação OAuth2, conforme configurado no painel da LivePix' })
  @IsOptional()
  @IsString()
  scope?: string
}

class StripeCredentialsDto {
  @ApiProperty({ required: false, description: 'Secret Key (sk_test_... ou sk_live_...)' })
  @IsOptional()
  @IsString()
  secretKey?: string

  @ApiProperty({ required: false, description: 'Publishable Key (pk_test_... ou pk_live_...), usada no frontend' })
  @IsOptional()
  @IsString()
  publishableKey?: string

  @ApiProperty({ required: false, description: 'Webhook signing secret (whsec_...). Preenchido automaticamente ao registrar o webhook.' })
  @IsOptional()
  @IsString()
  webhookSecret?: string
}

class UpdateGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas', 'livepix', 'stripe'], required: false })
  @IsOptional()
  @IsIn(['mercadopago', 'asaas', 'livepix', 'stripe'])
  activeGateway?: ActiveGateway

  @ApiProperty({ type: MercadoPagoCredentialsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => MercadoPagoCredentialsDto)
  mercadopago?: MercadoPagoCredentialsDto

  @ApiProperty({ type: AsaasCredentialsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => AsaasCredentialsDto)
  asaas?: AsaasCredentialsDto

  @ApiProperty({ type: LivePixCredentialsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => LivePixCredentialsDto)
  livepix?: LivePixCredentialsDto

  @ApiProperty({ type: StripeCredentialsDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => StripeCredentialsDto)
  stripe?: StripeCredentialsDto
}

class TestGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas', 'livepix', 'stripe'] })
  @IsIn(['mercadopago', 'asaas', 'livepix', 'stripe'])
  gateway: ActiveGateway
}

class RegisterLivePixWebhookDto {
  @ApiProperty({
    required: false,
    description: 'URL pública do webhook. Se omitida, usa APP_URL + /api/v1/webhooks/gateway/livepix.',
  })
  @IsOptional()
  @IsString()
  url?: string
}

class RegisterStripeWebhookDto {
  @ApiProperty({
    required: false,
    description: 'URL pública do webhook. Se omitida, usa APP_URL + /api/v1/webhooks/gateway/stripe.',
  })
  @IsOptional()
  @IsString()
  url?: string
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {

  constructor(
    private readonly settings: SettingsService,
    private readonly livepix: LivePixGateway,
    private readonly stripe: StripeGateway,
    private readonly config: ConfigService,
  ) {}

  @Get('gateway')
  @ApiOperation({ summary: 'Retorna configuração do gateway de pagamento (mascarada)' })
  getGateway() {
    return this.settings.getGatewayConfigMasked()
  }

  @Get('gateway/mercadopago/public-key')
  @ApiOperation({ summary: 'Retorna Public Key do Mercado Pago para tokenização no frontend' })
  async getMercadoPagoPublicKey() {
    const publicKey = await this.settings.getMercadoPagoPublicKey()
    return { publicKey }
  }

  @Put('gateway')
  @ApiOperation({ summary: 'Salva configuração do gateway de pagamento' })
  updateGateway(@Body() dto: UpdateGatewayDto) {
    return this.settings.updateGatewayConfig(dto)
  }

  @Post('gateway/test')
  @ApiOperation({ summary: 'Testa conectividade do gateway selecionado' })
  async testGateway(@Body() dto: TestGatewayDto) {
    const cfg = await this.settings.getGatewayConfig()

    if (dto.gateway === 'mercadopago') {
      if (!cfg.mercadopago.isConfigured) {
        throw new BadRequestException('Access Token do Mercado Pago não configurado.')
      }
      const token = cfg.mercadopago.accessToken
      const isTest = token.startsWith('TEST-')
      const isProd = token.startsWith('APP_USR-')
      if (!isTest && !isProd) {
        throw new BadRequestException(
          'Access Token inválido. Deve começar com TEST- (homologação) ou APP_USR- (produção).',
        )
      }
      const account = await this.settings.validateMercadoPagoCredentials(token)
      return {
        ok: true,
        message: `Conexão Mercado Pago OK. Conta: ${account.accountEmail ?? 'sem e-mail'} (${account.accountId ?? 'sem id'}). Ambiente: ${isTest ? '🧪 Homologação' : '🚀 Produção'}`,
      }
    }

    if (dto.gateway === 'asaas') {
      if (!cfg.asaas.isConfigured) {
        throw new BadRequestException('API Key do Asaas não configurada.')
      }
      return { ok: true, message: 'API Key do Asaas salva com sucesso.' }
    }

    if (dto.gateway === 'livepix') {
      if (!cfg.livepix.isConfigured) {
        throw new BadRequestException('Client ID/Secret da LivePix não configurados.')
      }
      try {
        const result = await this.livepix.verifyCredentials(
          cfg.livepix.clientId,
          cfg.livepix.clientSecret,
          cfg.livepix.scope,
        )
        return {
          ok: true,
          message: `Conexão LivePix OK. Token OAuth emitido com sucesso${result.scope ? ` (scopes: ${result.scope})` : ' (sem scope específico)'}.`,
        }
      } catch (err: any) {
        // Converte para 400 para que a mensagem real chegue ao frontend —
        // um 502 seria interceptado pelo reverse proxy e substituído por HTML.
        throw new BadRequestException(err?.message ?? 'Falha ao testar conexão com a LivePix')
      }
    }

    if (dto.gateway === 'stripe') {
      if (!cfg.stripe.isConfigured) {
        throw new BadRequestException('Secret Key da Stripe não configurada.')
      }
      const isTest = cfg.stripe.secretKey.startsWith('sk_test_')
      const isLive = cfg.stripe.secretKey.startsWith('sk_live_')
      if (!isTest && !isLive) {
        throw new BadRequestException('Secret Key inválida. Deve começar com sk_test_ ou sk_live_.')
      }
      try {
        const account = await this.stripe.verifyCredentials(cfg.stripe.secretKey)
        return {
          ok: true,
          message: `Conexão Stripe OK. Conta: ${account.email ?? account.accountId ?? 'sem identificação'}. Ambiente: ${isTest ? '🧪 Teste' : '🚀 Produção'}`,
        }
      } catch (err: any) {
        throw new BadRequestException(err?.message ?? 'Falha ao testar conexão com a Stripe')
      }
    }

    throw new BadRequestException('Gateway desconhecido.')
  }

  @Post('gateway/livepix/webhook')
  @ApiOperation({ summary: 'Registra (ou confirma) a URL de webhook da LivePix' })
  async registerLivePixWebhook(@Body() dto: RegisterLivePixWebhookDto) {
    const cfg = await this.settings.getGatewayConfig()
    if (!cfg.livepix.isConfigured) {
      throw new BadRequestException('Client ID/Secret da LivePix não configurados.')
    }

    const appUrl = (this.config.get<string>('app.url', '') || this.config.get<string>('APP_URL', '') || '').replace(/\/$/, '')
    const webhookUrl = dto.url || `${appUrl}/api/v1/webhooks/gateway/livepix`
    if (!/^https?:\/\//.test(webhookUrl)) {
      throw new BadRequestException(
        'Informe uma URL de webhook válida (ou configure APP_URL no ambiente).',
      )
    }

    this.livepix.setCredentials(cfg.livepix.clientId, cfg.livepix.clientSecret, cfg.livepix.scope)
    try {
      const result = await this.livepix.ensureWebhook(webhookUrl)
      return {
        ok: true,
        webhookUrl,
        webhookId: result.id,
        message: result.alreadyRegistered
          ? 'Webhook já estava registrado na LivePix.'
          : 'Webhook registrado com sucesso na LivePix.',
      }
    } catch (err: any) {
      // 400 em vez de 502 para a mensagem real chegar ao frontend (proxy-safe).
      throw new BadRequestException(err?.message ?? 'Falha ao registrar webhook na LivePix')
    }
  }

  @Post('gateway/stripe/webhook')
  @ApiOperation({ summary: 'Registra (ou confirma) o webhook endpoint da Stripe' })
  async registerStripeWebhook(@Body() dto: RegisterStripeWebhookDto) {
    const cfg = await this.settings.getGatewayConfig()
    if (!cfg.stripe.isConfigured) {
      throw new BadRequestException('Secret Key da Stripe não configurada.')
    }

    const appUrl = (this.config.get<string>('app.url', '') || this.config.get<string>('APP_URL', '') || '').replace(/\/$/, '')
    const webhookUrl = dto.url || `${appUrl}/api/v1/webhooks/gateway/stripe`
    if (!/^https?:\/\//.test(webhookUrl)) {
      throw new BadRequestException('Informe uma URL de webhook válida (ou configure APP_URL no ambiente).')
    }

    this.stripe.setCredentials(cfg.stripe.secretKey, cfg.stripe.webhookSecret)
    try {
      const result = await this.stripe.ensureWebhookEndpoint(webhookUrl)
      // A Stripe só revela o signing secret na criação — salvamos automaticamente
      // para que a verificação de assinatura funcione sem passo manual.
      if (result.secret) {
        await this.settings.updateGatewayConfig({ stripe: { webhookSecret: result.secret } })
      }
      return {
        ok: true,
        webhookUrl,
        webhookId: result.id,
        secretSaved: !!result.secret,
        message: result.alreadyRegistered
          ? 'Webhook já estava registrado na Stripe.'
          : 'Webhook registrado na Stripe e signing secret salvo automaticamente.',
      }
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'Falha ao registrar webhook na Stripe')
    }
  }
}
