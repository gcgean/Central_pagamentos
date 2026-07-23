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

class UpdateGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas', 'livepix'], required: false })
  @IsOptional()
  @IsIn(['mercadopago', 'asaas', 'livepix'])
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
}

class TestGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas', 'livepix'] })
  @IsIn(['mercadopago', 'asaas', 'livepix'])
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

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {

  constructor(
    private readonly settings: SettingsService,
    private readonly livepix: LivePixGateway,
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
        const account = await this.livepix.verifyCredentials(
          cfg.livepix.clientId,
          cfg.livepix.clientSecret,
          cfg.livepix.scope,
        )
        return {
          ok: true,
          message: `Conexão LivePix OK. Conta: ${account.username ?? account.email ?? 'sem identificação'}.`,
        }
      } catch (err: any) {
        // Converte para 400 para que a mensagem real chegue ao frontend —
        // um 502 seria interceptado pelo reverse proxy e substituído por HTML.
        throw new BadRequestException(err?.message ?? 'Falha ao testar conexão com a LivePix')
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
}
