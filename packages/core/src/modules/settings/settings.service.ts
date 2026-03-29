import { Injectable, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SettingsRepository } from './settings.repository'

export type ActiveGateway = 'mercadopago' | 'asaas'

export interface GatewayConfig {
  activeGateway: ActiveGateway
  mercadopago: {
    accessToken: string
    publicKey: string
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
    publicKey?: string
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
    const mpPublic  = settings['gateway.mercadopago.public_key']    ?? this.config.get<string>('MERCADOPAGO_PUBLIC_KEY', '')
    const mpSecret  = settings['gateway.mercadopago.webhook_secret'] ?? this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET', '')
    const asaasKey  = settings['gateway.asaas.api_key']             ?? this.config.get<string>('ASAAS_API_KEY', '')

    const dbActive = settings['gateway.active']
    const activeGateway: ActiveGateway = dbActive === 'mercadopago' ? 'mercadopago' : 'asaas'

    return {
      activeGateway,
      mercadopago: {
        accessToken:  mpToken,
        publicKey:    mpPublic,
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
        publicKey:     cfg.mercadopago.publicKey,
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
    if (dto.mercadopago?.publicKey !== undefined && dto.mercadopago.publicKey !== '') {
      await this.repo.set('gateway.mercadopago.public_key', dto.mercadopago.publicKey)
    }
    if (dto.mercadopago?.webhookSecret !== undefined && dto.mercadopago.webhookSecret !== '') {
      await this.repo.set('gateway.mercadopago.webhook_secret', dto.mercadopago.webhookSecret)
    }

    if (dto.asaas?.apiKey !== undefined && dto.asaas.apiKey !== '') {
      await this.repo.set('gateway.asaas.api_key', dto.asaas.apiKey)
    }

    return this.getGatewayConfigMasked()
  }

  async validateMercadoPagoCredentials(accessToken: string): Promise<{ accountEmail?: string; accountId?: number }> {
    const res = await fetch('https://api.mercadopago.com/users/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Falha ao validar credenciais no Mercado Pago: ${res.status} ${text}`)
    }
    const data = await res.json() as { email?: string; id?: number }
    return { accountEmail: data.email, accountId: data.id }
  }

  async getMercadoPagoPublicKey(): Promise<string> {
    const cfg = await this.getGatewayConfig()
    if (cfg.mercadopago.publicKey) return cfg.mercadopago.publicKey
    if (!cfg.mercadopago.accessToken) {
      throw new Error('Access Token do Mercado Pago não configurado')
    }

    // Tenta pegar a Public Key através da API do Mercado Pago
    try {
      const res = await fetch('https://api.mercadopago.com/v1/account/public_key', {
        headers: { Authorization: `Bearer ${cfg.mercadopago.accessToken}` },
      })
      if (!res.ok) {
        throw new Error(`Status ${res.status}`)
      }
      const data = await res.json() as { public_key?: string }
      if (data.public_key) {
        await this.repo.set('gateway.mercadopago.public_key', data.public_key)
        return data.public_key
      }
    } catch (err) {
      // Ignora erro se não conseguiu obter dinamicamente e exige do admin
    }

    throw new Error('Public Key do Mercado Pago não encontrada. Por favor, configure a Public Key manualmente no menu Configurações > Gateway.')
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private mask(val: string): string {
    if (val.length <= 8) return '••••••••'
    return val.slice(0, 6) + '•'.repeat(Math.max(val.length - 10, 4)) + val.slice(-4)
  }
}
