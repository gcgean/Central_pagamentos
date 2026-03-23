import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsRepository } from './settings.repository'

export type ActiveGateway = 'mock' | 'mercadopago' | 'asaas'

export interface GatewayConfig {
  activeGateway: ActiveGateway
  mercadopago: {
    accessToken: string
    webhookSecret: string
    isConfigured: boolean
  }
  asaas: {
    apiKey: string
    isConfigured: boolean
  }
}

export interface UpdateGatewayConfigDto {
  activeGateway?: ActiveGateway
  mercadopago?: {
    accessToken?: string
    webhookSecret?: string
  }
  asaas?: {
    apiKey?: string
  }
}

@Injectable()
export class SettingsService implements OnModuleInit {

  constructor(
    private readonly repo: SettingsRepository,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    await this.repo.ensureTable()
  }

  // ── Leitura ────────────────────────────────────────────────────────────────

  async getGatewayConfig(): Promise<GatewayConfig> {
    const settings = await this.repo.getByPrefix('gateway.')

    const mpToken   = settings['gateway.mercadopago.access_token']  ?? this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN',  '')
    const mpSecret  = settings['gateway.mercadopago.webhook_secret'] ?? this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET', '')
    const asaasKey  = settings['gateway.asaas.api_key']             ?? this.config.get<string>('ASAAS_API_KEY', '')

    // Precedência: DB > env MOCK_GATEWAY
    const mockEnv  = this.config.get<string>('MOCK_GATEWAY') === 'true'
    const dbActive = settings['gateway.active'] as ActiveGateway | undefined
    const activeGateway: ActiveGateway = dbActive ?? (mockEnv ? 'mock' : 'asaas')

    return {
      activeGateway,
      mercadopago: {
        accessToken:  mpToken,
        webhookSecret: mpSecret,
        isConfigured: !!mpToken,
      },
      asaas: {
        apiKey:       asaasKey,
        isConfigured: !!asaasKey,
      },
    }
  }

  /** Versão mascarada para exibição no frontend */
  async getGatewayConfigMasked(): Promise<GatewayConfig> {
    const cfg = await this.getGatewayConfig()
    return {
      ...cfg,
      mercadopago: {
        ...cfg.mercadopago,
        accessToken:   cfg.mercadopago.accessToken   ? this.mask(cfg.mercadopago.accessToken)   : '',
        webhookSecret: cfg.mercadopago.webhookSecret ? this.mask(cfg.mercadopago.webhookSecret) : '',
      },
      asaas: {
        ...cfg.asaas,
        apiKey: cfg.asaas.apiKey ? this.mask(cfg.asaas.apiKey) : '',
      },
    }
  }

  // ── Escrita ────────────────────────────────────────────────────────────────

  async updateGatewayConfig(dto: UpdateGatewayConfigDto): Promise<GatewayConfig> {
    if (dto.activeGateway !== undefined) {
      await this.repo.set('gateway.active', dto.activeGateway)
    }

    if (dto.mercadopago?.accessToken !== undefined && dto.mercadopago.accessToken !== '') {
      await this.repo.set('gateway.mercadopago.access_token', dto.mercadopago.accessToken)
    }
    if (dto.mercadopago?.webhookSecret !== undefined && dto.mercadopago.webhookSecret !== '') {
      await this.repo.set('gateway.mercadopago.webhook_secret', dto.mercadopago.webhookSecret)
    }

    if (dto.asaas?.apiKey !== undefined && dto.asaas.apiKey !== '') {
      await this.repo.set('gateway.asaas.api_key', dto.asaas.apiKey)
    }

    return this.getGatewayConfigMasked()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private mask(val: string): string {
    if (val.length <= 8) return '••••••••'
    return val.slice(0, 6) + '•'.repeat(Math.max(val.length - 10, 4)) + val.slice(-4)
  }
}
