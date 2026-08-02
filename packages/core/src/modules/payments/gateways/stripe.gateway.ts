import { Injectable, Logger, BadGatewayException, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Stripe from 'stripe'

// ─── Tipos ──────────────────────────────────────────────────────────────────
// Referência: https://docs.stripe.com/payments/checkout-sessions

export type StripeBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO'

export interface StripeCheckoutResult {
  id: string          // Checkout Session id (cs_...) — usado como externalChargeId
  url: string | null
}

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.deleted',
  'charge.refunded',
]

// ─── Adapter ─────────────────────────────────────────────────────────────────
//
// Usa Checkout Sessions hospedado (redirect) para todos os métodos de pagamento
// — mesmo padrão já usado por Mercado Pago (cartão) e LivePix. externalChargeId
// = Checkout Session id, que também é o identificador presente no webhook
// `checkout.session.completed`, permitindo correlação direta sem chamada extra.

@Injectable()
export class StripeGateway {

  private readonly logger = new Logger(StripeGateway.name)
  private client: Stripe
  private secretKey: string
  private webhookSecret: string

  constructor(private readonly config: ConfigService) {
    this.secretKey = config.get<string>('STRIPE_SECRET_KEY', '')
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', '')
    this.client = this.buildClient(this.secretKey)
  }

  private buildClient(secretKey: string): Stripe {
    return new Stripe(secretKey || 'sk_missing', { timeout: 15_000 })
  }

  /** Atualiza as credenciais (vindas do banco via SettingsService). */
  setCredentials(secretKey: string, webhookSecret?: string): void {
    if (!secretKey) {
      throw new Error('Secret Key da Stripe não configurada')
    }
    if (this.secretKey !== secretKey) {
      this.client = this.buildClient(secretKey)
    }
    this.secretKey = secretKey
    if (webhookSecret !== undefined) this.webhookSecret = webhookSecret
  }

  async verifyCredentials(secretKey: string): Promise<{ accountId?: string; email?: string }> {
    this.setCredentials(secretKey)
    try {
      const account = await this.client.accounts.retrieve()
      return { accountId: account.id, email: account.email ?? undefined }
    } catch (err: any) {
      this.logger.error(`Stripe verifyCredentials: ${err.message}`)
      throw new BadRequestException(`Falha ao autenticar na Stripe: ${err.message}`)
    }
  }

  // ─── Checkout avulso (pagamento único) ────────────────────────────────────

  async createCheckoutSession(params: {
    amount: number              // em centavos
    currency?: string
    description: string
    billingType: StripeBillingType
    customerEmail?: string
    successUrl: string
    cancelUrl: string
    externalReference: string
    installments?: number
  }): Promise<StripeCheckoutResult> {
    try {
      const session = await this.client.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: this.billingTypeToPaymentMethodTypes(params.billingType),
        customer_email: params.customerEmail,
        client_reference_id: params.externalReference,
        line_items: [{
          price_data: {
            currency: (params.currency ?? 'BRL').toLowerCase(),
            product_data: { name: params.description },
            unit_amount: params.amount,
          },
          quantity: 1,
        }],
        payment_method_options: params.billingType === 'CREDIT_CARD' && params.installments && params.installments > 1
          ? { card: { installments: { enabled: true } } }
          : undefined,
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { externalReference: params.externalReference },
      })
      this.logger.log(`Stripe checkout session criada: ${session.id}`)
      return { id: session.id, url: session.url }
    } catch (err: any) {
      this.handleError('createCheckoutSession', err)
    }
  }

  async getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
    try {
      return await this.client.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })
    } catch (err: any) {
      this.handleError('getCheckoutSession', err)
    }
  }

  /** Expira uma sessão de checkout ainda não paga (equivalente a cancelar a cobrança pendente). */
  async cancelCharge(sessionId: string): Promise<void> {
    try {
      await this.client.checkout.sessions.expire(sessionId)
      this.logger.log(`Stripe checkout session expirada: ${sessionId}`)
    } catch (err: any) {
      this.handleError('cancelCharge', err)
    }
  }

  async refundPayment(sessionId: string, amountCents?: number): Promise<void> {
    try {
      const session = await this.client.checkout.sessions.retrieve(sessionId)
      const paymentIntentId = typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id
      if (!paymentIntentId) {
        throw new BadGatewayException('Sessão Stripe sem pagamento associado (não concluída, ou é assinatura).')
      }
      await this.client.refunds.create({
        payment_intent: paymentIntentId,
        amount: amountCents,
      })
      this.logger.log(`Stripe payment estornado: ${paymentIntentId}`)
    } catch (err: any) {
      if (err instanceof BadGatewayException) throw err
      this.handleError('refundPayment', err)
    }
  }

  // ─── Assinaturas recorrentes ───────────────────────────────────────────────

  async createSubscriptionCheckout(params: {
    amount: number
    currency?: string
    description: string
    intervalUnit: 'day' | 'week' | 'month' | 'year'
    intervalCount: number
    customerEmail?: string
    successUrl: string
    cancelUrl: string
    externalReference: string
  }): Promise<StripeCheckoutResult> {
    try {
      const session = await this.client.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        customer_email: params.customerEmail,
        client_reference_id: params.externalReference,
        line_items: [{
          price_data: {
            currency: (params.currency ?? 'BRL').toLowerCase(),
            product_data: { name: params.description },
            unit_amount: params.amount,
            recurring: {
              interval: params.intervalUnit === 'day' ? 'day' : params.intervalUnit,
              interval_count: params.intervalCount,
            },
          },
          quantity: 1,
        }],
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: { externalReference: params.externalReference },
      })
      return { id: session.id, url: session.url }
    } catch (err: any) {
      this.handleError('createSubscriptionCheckout', err)
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.client.subscriptions.cancel(subscriptionId)
      this.logger.log(`Stripe subscription cancelada: ${subscriptionId}`)
    } catch (err: any) {
      this.handleError('cancelSubscription', err)
    }
  }

  // ─── Webhooks ───────────────────────────────────────────────────────────────

  /** Verifica a assinatura HMAC do webhook. Exige o corpo bruto (Buffer/string), não reparseado. */
  verifyWebhookSignature(rawBody: Buffer | string, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new BadRequestException('Webhook secret da Stripe não configurado. Acesse Configurações → Gateway.')
    }
    try {
      return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret)
    } catch (err: any) {
      throw new BadRequestException(`Assinatura de webhook Stripe inválida: ${err.message}`)
    }
  }

  async listWebhookEndpoints(): Promise<Stripe.WebhookEndpoint[]> {
    const result = await this.client.webhookEndpoints.list({ limit: 100 })
    return result.data
  }

  async createWebhookEndpoint(url: string): Promise<{ id: string; secret?: string }> {
    const created = await this.client.webhookEndpoints.create({
      url,
      enabled_events: WEBHOOK_EVENTS,
    })
    this.logger.log(`Stripe webhook endpoint criado: ${created.id} → ${url}`)
    return { id: created.id, secret: created.secret }
  }

  /** Registra o webhook evitando duplicar; retorna o secret só quando cria um novo. */
  async ensureWebhookEndpoint(url: string): Promise<{ id: string; secret?: string; alreadyRegistered: boolean }> {
    const endpoints = await this.listWebhookEndpoints()
    const found = endpoints.find(w => w.url === url)
    if (found) return { id: found.id, alreadyRegistered: true }
    const created = await this.createWebhookEndpoint(url)
    return { id: created.id, secret: created.secret, alreadyRegistered: false }
  }

  // ─── Mapeamentos ────────────────────────────────────────────────────────────

  private billingTypeToPaymentMethodTypes(
    billingType: StripeBillingType,
  ): Stripe.Checkout.SessionCreateParams.PaymentMethodType[] {
    const map: Record<StripeBillingType, Stripe.Checkout.SessionCreateParams.PaymentMethodType[]> = {
      CREDIT_CARD: ['card'],
      PIX: ['pix'],
      BOLETO: ['boleto'],
    }
    return map[billingType] ?? ['card']
  }

  static mapCheckoutSessionStatus(status: string, paymentStatus?: string): 'pending' | 'paid' | 'failed' | 'canceled' {
    if (status === 'complete' || paymentStatus === 'paid') return 'paid'
    if (status === 'expired') return 'canceled'
    return 'pending'
  }

  private handleError(method: string, err: unknown): never {
    const stripeErr = err as any
    const message = stripeErr?.raw?.message ?? stripeErr?.message ?? 'Erro desconhecido no gateway Stripe'
    this.logger.error(`StripeGateway.${method}: ${message}`)
    throw new BadGatewayException(`Erro no gateway Stripe: ${message}`)
  }
}
