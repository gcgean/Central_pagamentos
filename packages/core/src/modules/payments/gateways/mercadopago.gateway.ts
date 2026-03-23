import { Injectable, Logger, BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  MercadoPagoConfig,
  Customer,
  Payment,
  PaymentRefund,
  PreApproval,
} from 'mercadopago'
// Sub-path types inlined to avoid deep import resolution issues
type PaymentCreateData    = { body: Record<string, any>; requestOptions?: Record<string, any> }
type PreApprovalCreateData = { body: Record<string, any> }
type CustomerCreateData   = { body: Record<string, any> }
import * as crypto from 'crypto'

// ─── Tipos internos ──────────────────────────────────────────────────────────

export type MpBillingType = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'

export interface MpCustomer {
  id: string
  email: string
  first_name: string
  last_name: string
  identification?: { type: string; number: string }
}

export interface MpCharge {
  id: number
  status: string                   // pending | approved | authorized | in_process | in_mediation | rejected | cancelled | refunded | charged_back
  status_detail: string
  payment_method_id: string
  transaction_amount: number       // em reais
  date_of_expiration?: string
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
    }
  }
  transaction_details?: {
    external_resource_url?: string  // URL do boleto
  }
  external_reference?: string
  description?: string
}

export interface MpSubscription {
  id: string
  status: string
  external_reference?: string
  init_point: string               // link de pagamento da assinatura
  auto_recurring: {
    frequency: number
    frequency_type: string
    transaction_amount: number
    currency_id: string
  }
}

export interface CreateMpChargeParams {
  email: string
  cpfCnpj: string                  // digits only
  name: string
  amount: number                   // em centavos
  description: string
  billingType: MpBillingType
  externalReference?: string
  installments?: number
  // Cartão de crédito tokenizado (via Mercado Pago.js no front)
  cardToken?: string
  // PIX — expiração customizada (padrão 24h)
  pixExpiresInMinutes?: number
  // Boleto — data de vencimento
  boletoDueDate?: string           // YYYY-MM-DD
}

export interface CreateMpSubscriptionParams {
  email: string
  name: string
  amount: number                   // em centavos
  intervalUnit: 'day' | 'month' | 'year'
  intervalCount: number
  description: string
  externalReference?: string
  backUrl?: string
}

// ─── Gateway ──────────────────────────────────────────────────────────────────

@Injectable()
export class MercadoPagoGateway {

  private readonly logger = new Logger(MercadoPagoGateway.name)
  private client: MercadoPagoConfig
  private webhookSecret: string

  constructor(private readonly config: ConfigService) {
    const accessToken = config.get<string>('MERCADOPAGO_ACCESS_TOKEN', '')
    this.webhookSecret = config.get<string>('MERCADOPAGO_WEBHOOK_SECRET', '')

    if (accessToken) {
      this.client = new MercadoPagoConfig({
        accessToken,
        options: { timeout: 15_000 },
      })
    } else {
      this.logger.warn('MERCADOPAGO_ACCESS_TOKEN não configurado — gateway inativo')
      this.client = null as unknown as MercadoPagoConfig
    }
  }

  /**
   * Reinicializa o cliente com credenciais vindas do banco (via SettingsService).
   * Chamado pelo CheckoutService antes de cada operação com o gateway.
   */
  setCredentials(accessToken: string, webhookSecret?: string): void {
    if (!accessToken) throw new Error('Access Token do Mercado Pago não configurado')
    this.client = new MercadoPagoConfig({ accessToken, options: { timeout: 15_000 } })
    if (webhookSecret) this.webhookSecret = webhookSecret
    this.logger.log('MercadoPago client inicializado com credenciais do banco')
  }

  // ─── Clientes ──────────────────────────────────────────────────────────────

  /**
   * Localiza um cliente pelo e-mail ou cria um novo.
   * O Mercado Pago não indexa por CPF/CNPJ diretamente na busca,
   * por isso a busca primária é pelo e-mail.
   */
  async createOrFindCustomer(data: {
    name: string
    cpfCnpj: string
    email: string
  }): Promise<MpCustomer> {
    try {
      const existing = await this.findCustomerByEmail(data.email)
      if (existing) return existing

      const [firstName, ...rest] = data.name.trim().split(' ')
      const lastName = rest.join(' ') || firstName
      const docType = data.cpfCnpj.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'

      const body: CustomerCreateData['body'] = {
        email: data.email,
        first_name: firstName,
        last_name: lastName,
        identification: {
          type: docType,
          number: data.cpfCnpj.replace(/\D/g, ''),
        },
      }

      const created = await new Customer(this.client).create({ body })
      this.logger.log(`MP customer criado: ${created.id}`)
      return created as unknown as MpCustomer
    } catch (err) {
      this.handleError('createOrFindCustomer', err)
    }
  }

  async findCustomerByEmail(email: string): Promise<MpCustomer | null> {
    try {
      const result = await new Customer(this.client).search({
        options: { email },
      })
      return (result.results?.[0] as unknown as MpCustomer) ?? null
    } catch {
      return null
    }
  }

  // ─── Cobranças ─────────────────────────────────────────────────────────────

  async createCharge(params: CreateMpChargeParams): Promise<MpCharge> {
    try {
      const amountInReais = params.amount / 100
      const docClean = params.cpfCnpj.replace(/\D/g, '')

      const body: PaymentCreateData['body'] = {
        transaction_amount: amountInReais,
        description: params.description,
        external_reference: params.externalReference,
        payment_method_id: this.billingTypeToMethodId(params.billingType),
        payer: {
          email: params.email,
          identification: {
            type: docClean.length === 11 ? 'CPF' : 'CNPJ',
            number: docClean,
          },
        },
      }

      // PIX — define expiração
      if (params.billingType === 'PIX') {
        const minutes = params.pixExpiresInMinutes ?? 1440  // 24h padrão
        body.date_of_expiration = new Date(Date.now() + minutes * 60_000).toISOString()
      }

      // Cartão de crédito — requer token gerado pelo Mercado Pago.js no front
      if (params.billingType === 'CREDIT_CARD') {
        if (!params.cardToken) {
          throw new BadGatewayException(
            'Token de cartão obrigatório. Gere via Mercado Pago.js antes de enviar.',
          )
        }
        body.token = params.cardToken
        body.installments = params.installments ?? 1
        body.payment_method_id = 'credit_card'
      }

      // Boleto — vencimento
      if (params.billingType === 'BOLETO') {
        body.payment_method_id = 'bolbradesco'
        if (params.boletoDueDate) {
          body.date_of_expiration = `${params.boletoDueDate}T23:59:59.999-03:00`
        }
      }

      const idempotencyKey = `charge-${params.externalReference ?? Date.now()}`
      const result = await new Payment(this.client).create({
        body,
        requestOptions: { idempotencyKey },
      })

      this.logger.log(`MP payment criado: ${result.id} (${result.status})`)
      return result as unknown as MpCharge
    } catch (err) {
      this.handleError('createCharge', err)
    }
  }

  async getCharge(paymentId: number | string): Promise<MpCharge> {
    try {
      const result = await new Payment(this.client).get({ id: Number(paymentId) })
      return result as unknown as MpCharge
    } catch (err) {
      this.handleError('getCharge', err)
    }
  }

  async cancelCharge(paymentId: number | string): Promise<void> {
    try {
      await new Payment(this.client).cancel({ id: Number(paymentId) })
      this.logger.log(`MP payment cancelado: ${paymentId}`)
    } catch (err) {
      this.handleError('cancelCharge', err)
    }
  }

  /**
   * Estorna um pagamento aprovado (total ou parcial).
   * Usa PaymentRefund.create em vez de Payment.refund (que não existe no SDK v2).
   */
  async refundPayment(paymentId: number | string, amountInCents?: number): Promise<void> {
    try {
      const body = amountInCents ? { amount: amountInCents / 100 } : {}
      await new PaymentRefund(this.client).create({
        payment_id: Number(paymentId),
        body,
      })
      this.logger.log(`MP payment estornado: ${paymentId}`)
    } catch (err) {
      this.handleError('refundPayment', err)
    }
  }

  // ─── Extração de dados específicos por método de pagamento ────────────────

  extractPixData(charge: MpCharge): { qrCode: string; qrCodeBase64: string } | null {
    const txData = charge.point_of_interaction?.transaction_data
    if (!txData?.qr_code) return null
    return {
      qrCode: txData.qr_code,
      qrCodeBase64: txData.qr_code_base64 ?? '',
    }
  }

  extractBoletoUrl(charge: MpCharge): string | null {
    return charge.transaction_details?.external_resource_url ?? null
  }

  // ─── Assinaturas recorrentes (PreApproval) ─────────────────────────────────

  /**
   * Cria uma assinatura recorrente (PreApproval) no Mercado Pago.
   * Retorna um `init_point` que o cliente acessa para aprovar e vincular o cartão.
   *
   * Para cobranças automáticas sem redirecionamento, crie um PreApprovalPlan
   * e associe um card token ao cliente separadamente.
   */
  async createSubscription(params: CreateMpSubscriptionParams): Promise<MpSubscription> {
    try {
      const { frequency, frequencyType } = this.intervalToMpFrequency(
        params.intervalUnit,
        params.intervalCount,
      )

      const body: PreApprovalCreateData['body'] = {
        reason: params.description,
        external_reference: params.externalReference,
        payer_email: params.email,
        back_url: params.backUrl ?? '',
        auto_recurring: {
          frequency,
          frequency_type: frequencyType,
          transaction_amount: params.amount / 100,
          currency_id: 'BRL',
        },
      }

      const result = await new PreApproval(this.client).create({ body })
      this.logger.log(`MP pre-approval criada: ${result.id}`)
      return result as unknown as MpSubscription
    } catch (err) {
      this.handleError('createSubscription', err)
    }
  }

  async cancelSubscription(preApprovalId: string): Promise<void> {
    try {
      await new PreApproval(this.client).update({
        id: preApprovalId,
        body: { status: 'cancelled' },
      })
      this.logger.log(`MP pre-approval cancelada: ${preApprovalId}`)
    } catch (err) {
      this.handleError('cancelSubscription', err)
    }
  }

  async getSubscription(preApprovalId: string): Promise<MpSubscription> {
    try {
      const result = await new PreApproval(this.client).get({ id: preApprovalId })
      return result as unknown as MpSubscription
    } catch (err) {
      this.handleError('getSubscription', err)
    }
  }

  // ─── Validação de webhook ──────────────────────────────────────────────────

  /**
   * Valida a assinatura HMAC-SHA256 do webhook do Mercado Pago.
   *
   * Cabeçalhos recebidos:
   *   x-signature   → ts=<epoch>,v1=<hmac-hex>
   *   x-request-id  → UUID único da notificação
   *
   * O manifesto assinado é: `id:<dataId>;request-id:<xRequestId>;ts:<ts>;`
   *
   * Docs: https://www.mercadopago.com.br/developers/pt/docs/notifications/webhooks/security
   */
  validateWebhookSignature(
    xSignature: string,
    xRequestId: string,
    dataId: string,
  ): boolean {
    if (!this.webhookSecret) {
      this.logger.warn('MERCADOPAGO_WEBHOOK_SECRET não configurado — validação ignorada')
      return true
    }

    try {
      const parts = Object.fromEntries(
        xSignature.split(',').map(p => p.split('=') as [string, string]),
      )
      const ts = parts['ts']
      const v1 = parts['v1']
      if (!ts || !v1) return false

      const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`

      const expected = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(manifest)
        .digest('hex')

      return crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(v1, 'hex'),
      )
    } catch {
      return false
    }
  }

  // ─── Mapeamento de status MP → status interno ─────────────────────────────

  static mapStatus(mpStatus: string): 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled' {
    const map: Record<string, 'pending' | 'paid' | 'failed' | 'refunded' | 'canceled'> = {
      pending:       'pending',
      authorized:    'pending',
      in_process:    'pending',
      in_mediation:  'pending',
      approved:      'paid',
      rejected:      'failed',
      cancelled:     'canceled',
      refunded:      'refunded',
      charged_back:  'refunded',
    }
    return map[mpStatus] ?? 'pending'
  }

  // ─── Mapeamento de billing type → payment_method_id ──────────────────────

  private billingTypeToMethodId(billingType: MpBillingType): string {
    const map: Record<MpBillingType, string> = {
      PIX:         'pix',
      CREDIT_CARD: 'credit_card',
      BOLETO:      'bolbradesco',
      UNDEFINED:   'pix',
    }
    return map[billingType]
  }

  // ─── Mapeamento de intervalo → frequência MP ──────────────────────────────

  private intervalToMpFrequency(
    unit: 'day' | 'month' | 'year',
    count: number,
  ): { frequency: number; frequencyType: 'days' | 'months' } {
    if (unit === 'day')  return { frequency: count, frequencyType: 'days' }
    if (unit === 'year') return { frequency: count * 12, frequencyType: 'months' }
    return { frequency: count, frequencyType: 'months' }
  }

  // ─── Tratamento de erros ──────────────────────────────────────────────────

  private handleError(method: string, err: unknown): never {
    const mpErr = err as any
    const message =
      mpErr?.cause?.[0]?.description ??
      mpErr?.error?.message ??
      mpErr?.message ??
      'Erro desconhecido no gateway Mercado Pago'

    this.logger.error(`MercadoPagoGateway.${method}: ${message}`, mpErr?.cause)
    throw new BadGatewayException(`Erro no gateway de pagamento: ${message}`)
  }
}
