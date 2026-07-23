import { Injectable, Logger, BadGatewayException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

// ─── Tipos da LivePix ──────────────────────────────────────────────────────────
// Referência: https://docs.livepix.gg/api

const OAUTH_TOKEN_URL = 'https://oauth.livepix.gg/oauth2/token'
const API_BASE_URL = 'https://api.livepix.gg'

export type LivePixRecurrence = 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

export interface LivePixCheckoutInit {
  reference: string
  redirectUrl: string
}

export interface LivePixPayment {
  id: string
  proof?: string
  reference: string
  amount: number
  currency: string
  createdAt: string
}

export interface LivePixPlan {
  id: string
  slug?: string
  name?: string
  description?: string
  amount?: number
  currency?: string
}

export interface LivePixSubscription {
  id: string
  subscriber: string
  months: number
  currency: string
  amount: number
  recurrence: LivePixRecurrence
  status: 'active' | 'pending' | 'cancelled'
  renewAt: string
  updatedAt: string
  createdAt: string
}

// ─── Adapter ─────────────────────────────────────────────────────────────────
//
// Limitações conhecidas da API pública da LivePix (ausentes de documentação):
//   - Não há endpoint de estorno.
//   - Não há endpoint de cancelamento de cobrança ou de assinatura via API
//     (só é possível saber que uma assinatura foi cancelada via webhook).
//   - Pagamentos avulsos e assinaturas usam checkout hospedado
//     (checkout.livepix.gg) — não há emissão direta de QR Code PIX nem coleta
//     de CPF/CNPJ do pagador na criação da cobrança.
//   - Os Termos de Uso da LivePix descrevem o serviço como intermediação de
//     doações criador↔audiência, sem previsão de cobrança comercial de
//     produtos/serviços de terceiros.

@Injectable()
export class LivePixGateway {

  private readonly logger = new Logger(LivePixGateway.name)
  private readonly client: AxiosInstance

  private clientId: string
  private clientSecret: string
  private scope: string
  private accessToken?: string
  private tokenExpiresAt = 0

  constructor(private readonly config: ConfigService) {
    this.clientId = config.get<string>('LIVEPIX_CLIENT_ID', '')
    this.clientSecret = config.get<string>('LIVEPIX_CLIENT_SECRET', '')
    this.scope = config.get<string>('LIVEPIX_SCOPE', '')

    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 15_000,
    })

    this.client.interceptors.request.use(async cfg => {
      const token = await this.ensureToken()
      cfg.headers = cfg.headers ?? {}
      ;(cfg.headers as any).Authorization = `Bearer ${token}`
      return cfg
    })

    this.client.interceptors.response.use(
      res => res,
      err => {
        this.logger.error(
          `LivePix API error: ${err.response?.status} ${err.config?.url}`,
          err.response?.data,
        )
        throw new BadGatewayException(
          `Erro no gateway LivePix: ${err.response?.data?.message ?? err.response?.data?.error ?? err.message}`,
        )
      },
    )
  }

  /**
   * Atualiza as credenciais (vindas do banco via SettingsService).
   * Invalida o token em cache se as credenciais mudarem.
   */
  setCredentials(clientId: string, clientSecret: string, scope?: string): void {
    if (!clientId || !clientSecret) {
      throw new Error('Credenciais da LivePix não configuradas')
    }
    if (this.clientId !== clientId || this.clientSecret !== clientSecret) {
      this.accessToken = undefined
      this.tokenExpiresAt = 0
    }
    this.clientId = clientId
    this.clientSecret = clientSecret
    if (scope !== undefined) this.scope = scope
  }

  // ─── OAuth2 (client_credentials) ────────────────────────────────────────────

  private async ensureToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken
    }
    if (!this.clientId || !this.clientSecret) {
      throw new BadRequestException(
        'Credenciais da LivePix não configuradas. Acesse Configurações → Gateway.',
      )
    }

    // A LivePix usa OAuth2 (aparenta ser Ory Hydra). Dependendo de como a aplicação
    // foi registrada, o token endpoint pode exigir as credenciais via HTTP Basic
    // Auth (client_secret_basic) OU no corpo (client_secret_post). Tentamos Basic
    // primeiro e caímos para o corpo caso o servidor rejeite com invalid_client.
    let lastErr: any
    for (const method of ['basic', 'post'] as const) {
      try {
        const token = await this.requestToken(method)
        this.accessToken = token.access_token
        this.tokenExpiresAt = Date.now() + Math.max((token.expires_in ?? 3600) - 60, 30) * 1000
        this.logger.log(`LivePix OAuth OK (método ${method})`)
        return this.accessToken as string
      } catch (err: any) {
        lastErr = err
        const status = err.response?.status
        const oauthError = err.response?.data?.error
        this.logger.error(
          `LivePix OAuth error [${method}]: HTTP ${status ?? 'sem resposta'} — ${JSON.stringify(err.response?.data ?? err.message)}`,
        )
        // Só faz sentido tentar o outro método quando é falha de autenticação do cliente.
        const isClientAuthError = status === 401 || oauthError === 'invalid_client'
        if (!isClientAuthError) break
      }
    }

    const detail = this.describeOAuthError(lastErr)
    throw new BadRequestException(`Falha ao autenticar na LivePix: ${detail}`)
  }

  private async requestToken(method: 'basic' | 'post'): Promise<{ access_token: string; expires_in?: number }> {
    const body = new URLSearchParams({ grant_type: 'client_credentials' })
    if (this.scope) body.set('scope', this.scope)

    const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (method === 'basic') {
      const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
      headers.Authorization = `Basic ${credentials}`
    } else {
      body.set('client_id', this.clientId)
      body.set('client_secret', this.clientSecret)
    }

    const { data } = await axios.post(OAUTH_TOKEN_URL, body.toString(), { headers, timeout: 15_000 })
    return data
  }

  private describeOAuthError(err: any): string {
    if (!err) return 'erro desconhecido'
    const status = err.response?.status
    const data = err.response?.data
    if (data?.error_description) return `${data.error ?? status}: ${data.error_description}`
    if (data?.error) return `${status ?? ''} ${data.error}`.trim()
    if (status) return `HTTP ${status}`
    return err.message ?? 'sem resposta do servidor OAuth'
  }

  async verifyCredentials(clientId: string, clientSecret: string, scope?: string): Promise<{ email?: string; username?: string }> {
    this.setCredentials(clientId, clientSecret, scope)
    const account = await this.getAccount()
    return { email: account.email, username: account.username }
  }

  // ─── Conta ───────────────────────────────────────────────────────────────────

  async getAccount(): Promise<{ id: string; email: string; username: string; displayName: string }> {
    const { data } = await this.client.get('/v2/account')
    return data.data
  }

  // ─── Pagamentos avulsos (checkout hospedado) ──────────────────────────────────

  async createPayment(params: {
    amount: number          // em centavos
    currency?: string
    redirectUrl: string
  }): Promise<LivePixCheckoutInit> {
    const { data } = await this.client.post('/v2/payments', {
      amount: params.amount,
      currency: params.currency ?? 'BRL',
      redirectUrl: params.redirectUrl,
    })
    return data.data
  }

  async getPayment(paymentId: string): Promise<LivePixPayment> {
    const { data } = await this.client.get(`/v2/payments/${paymentId}`)
    return data.data
  }

  // ─── Planos de assinatura ──────────────────────────────────────────────────

  async createPlan(params: {
    slug: string
    name: string
    description?: string
    amount: number         // em centavos
    currency?: string
  }): Promise<LivePixPlan> {
    const { data } = await this.client.post('/v2/subscriptions/plans', {
      slug: params.slug,
      name: params.name,
      description: params.description ?? params.name,
      amount: params.amount,
      currency: params.currency ?? 'BRL',
    })
    return data.data
  }

  async listPlans(page = 1, limit = 100): Promise<LivePixPlan[]> {
    const { data } = await this.client.get('/v2/subscriptions/plans', { params: { page, limit } })
    return data.data ?? []
  }

  async findPlanBySlug(slug: string): Promise<LivePixPlan | null> {
    for (let page = 1; page <= 20; page++) {
      const items = await this.listPlans(page, 100)
      const found = items.find((p: any) => p.slug === slug)
      if (found) return found
      if (items.length < 100) break
    }
    return null
  }

  /** Reaproveita um plano existente pelo slug ou cria um novo. */
  async createOrFindPlan(params: {
    slug: string
    name: string
    description?: string
    amount: number
    currency?: string
  }): Promise<LivePixPlan> {
    const existing = await this.findPlanBySlug(params.slug)
    if (existing) return existing
    const created = await this.createPlan(params)
    this.logger.log(`LivePix plan criado: ${created.id} (${params.slug})`)
    return created
  }

  // ─── Assinaturas ────────────────────────────────────────────────────────────

  async createSubscription(params: {
    planId: string
    recurrence: LivePixRecurrence
    subscriber: { email: string; username?: string }
    redirectUrl: string
  }): Promise<LivePixCheckoutInit> {
    const { data } = await this.client.post('/v2/subscriptions', {
      planId: params.planId,
      recurrence: params.recurrence,
      subscriber: params.subscriber,
      redirectUrl: params.redirectUrl,
    })
    this.logger.log(`LivePix subscription checkout criado: ${data.data?.reference}`)
    return data.data
  }

  async getSubscription(subscriptionId: string): Promise<LivePixSubscription> {
    const { data } = await this.client.get(`/v2/subscriptions/${subscriptionId}`)
    return data.data
  }

  async listSubscriptionTransactions(subscriptionId: string, page = 1, limit = 100) {
    const { data } = await this.client.get(`/v2/subscriptions/${subscriptionId}/transactions`, {
      params: { page, limit },
    })
    return data.data ?? []
  }

  // ─── Webhooks ───────────────────────────────────────────────────────────────

  async listWebhooks(page = 1, limit = 100): Promise<Array<{ id: string; url?: string }>> {
    const { data } = await this.client.get('/v2/webhooks', { params: { page, limit } })
    return data.data ?? []
  }

  async createWebhook(url: string): Promise<{ id: string }> {
    const { data } = await this.client.post('/v2/webhooks', { url })
    this.logger.log(`LivePix webhook registrado: ${data.data?.id} → ${url}`)
    return data.data
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.client.delete(`/v2/webhooks/${webhookId}`)
    this.logger.log(`LivePix webhook removido: ${webhookId}`)
  }

  /**
   * Registra a URL de webhook, evitando duplicar caso já esteja cadastrada.
   * A API não expõe filtro por URL — a checagem é feita client-side na listagem.
   */
  async ensureWebhook(url: string): Promise<{ id: string; alreadyRegistered: boolean }> {
    for (let page = 1; page <= 20; page++) {
      const items = await this.listWebhooks(page, 100)
      const found = items.find(w => w.url === url)
      if (found) return { id: found.id, alreadyRegistered: true }
      if (items.length < 100) break
    }
    const created = await this.createWebhook(url)
    return { id: created.id, alreadyRegistered: false }
  }

  // ─── Mapear intervalo de plano → recorrência LivePix ──────────────────────

  static intervalToRecurrence(unit: string, count: number): LivePixRecurrence {
    if (unit === 'month') {
      if (count === 1)  return 'monthly'
      if (count === 3)  return 'quarterly'
      if (count === 6)  return 'semiannual'
      if (count === 12) return 'yearly'
    }
    if (unit === 'year' && count === 1) return 'yearly'

    throw new BadRequestException(
      `Intervalo de plano (${count}x ${unit}) não suportado pela LivePix. `
      + 'Recorrências disponíveis: mensal, trimestral, semestral, anual.',
    )
  }
}
