import {
  Controller, Get, Put, Post, Body, UseGuards, BadRequestException,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { IsOptional, IsString, IsIn, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { SettingsService, ActiveGateway } from './settings.service'

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

class UpdateGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas'], required: false })
  @IsOptional()
  @IsIn(['mercadopago', 'asaas'])
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
}

class TestGatewayDto {
  @ApiProperty({ enum: ['mercadopago', 'asaas'] })
  @IsIn(['mercadopago', 'asaas'])
  gateway: ActiveGateway
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'settings', version: '1' })
export class SettingsController {

  constructor(private readonly settings: SettingsService) {}

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

    throw new BadRequestException('Gateway desconhecido.')
  }
}
