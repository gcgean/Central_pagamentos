import { Injectable, Logger, BadGatewayException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

// ─── Tipos do Asaas ───────────────────────────────────────────────────────────

export interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj: string
  email?: string
  phone?: string
  mobilePhone?: string
}

export interface AsaasCharge {
  id: string
  customer: string
  billingType: 'CREDIT_CARD' | 'PIX'
  value: number
  dueDate: string
  status: string
  invoiceUrl?: string
  bankSlipUrl?: string
  pixQrCodeId?: string
  pixCopiaECola?: string
  externalReference?: string
}

export interface AsaasSubscription {
  id: string
  customer: string
  billingType: string
  value: number
  nextDueDate: string
  cycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'
  status: string
  externalReference?: string
}

export interface CreateChargeParams {
  externalCustomerId: string
  value: number             // em reais (o Asaas usa reais, convertemos de centavos)
  dueDate: string           // YYYY-MM-DD
  description: string
  billingType: 'PIX' | 'CREDIT_CARD'
  externalReference?: string
  installmentCount?: number
  installmentValue?: number
  creditCard?: {
    holderName: string
    number: string
    expiryMonth: string
    expiryYear: string
    ccv: string
  }
  creditCardHolderInfo?: {
    name: string
    email: string
    cpfCnpj: string
    postalCode: string
    phone: string
  }
  remoteIp?: string
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

@Injectable()
export class AsaasGateway {

  private readonly logger = new Logger(AsaasGateway.name)
  private readonly client: AxiosInstance

  constructor(private readonly config: ConfigService) {
    const baseURL = config.getOrThrow<string>('ASAAS_BASE_URL')
    const apiKey = config.getOrThrow<string>('ASAAS_API_KEY')

    this.client = axios.create({
      baseURL,
      headers: {
        'access_token': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'HubBilling/1.0',
      },
      timeout: 15_000,
    })

    // Log de erros de gateway sem expor dados sensíveis
    this.client.interceptors.response.use(
      res => res,
      err => {
        this.logger.error(
          `Asaas API error: ${err.response?.status} ${err.config?.url}`,
          err.response?.data
        )
        throw new BadGatewayException(
          `Erro no gateway de pagamento: ${err.response?.data?.errors?.[0]?.description ?? err.message}`
        )
      }
    )
  }

  // ─── Clientes ──────────────────────────────────────────────────────────────

  async createOrFindCustomer(data: {
    name: string
    cpfCnpj: string
    email?: string
    phone?: string
  }): Promise<AsaasCustomer> {
    // Tenta encontrar o cliente existente pelo CPF/CNPJ
    const existing = await this.findCustomerByCpfCnpj(data.cpfCnpj)
    if (existing) return existing

    const { data: customer } = await this.client.post('/customers', {
      name: data.name,
      cpfCnpj: data.cpfCnpj,
      email: data.email,
      phone: data.phone,
      notificationDisabled: false,
    })

    this.logger.log(`Asaas customer criado: ${customer.id}`)
    return customer
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
    const { data } = await this.client.get('/customers', {
      params: { cpfCnpj },
    })
    return data.data?.[0] ?? null
  }

  // ─── Cobranças avulsas ─────────────────────────────────────────────────────

  async createCharge(params: CreateChargeParams): Promise<AsaasCharge> {
    const { data } = await this.client.post('/payments', {
      customer: params.externalCustomerId,
      billingType: params.billingType,
      value: params.value / 100,  // centavos → reais
      dueDate: params.dueDate,
      description: params.description,
      externalReference: params.externalReference,
      installmentCount: params.installmentCount,
      installmentValue: params.installmentValue
        ? params.installmentValue / 100
        : undefined,
      creditCard: params.creditCard,
      creditCardHolderInfo: params.creditCardHolderInfo,
      remoteIp: params.remoteIp,
    })
    return data
  }

  async getCharge(externalChargeId: string): Promise<AsaasCharge> {
    const { data } = await this.client.get(`/payments/${externalChargeId}`)
    return data
  }

  async cancelCharge(externalChargeId: string): Promise<void> {
    await this.client.delete(`/payments/${externalChargeId}`)
  }

  // ─── Pix QR Code ──────────────────────────────────────────────────────────

  async getPixQrCode(externalChargeId: string): Promise<{
    encodedImage: string
    payload: string
    expirationDate: string
  }> {
    const { data } = await this.client.get(`/payments/${externalChargeId}/pixQrCode`)
    return data
  }

  // ─── Assinaturas recorrentes ───────────────────────────────────────────────

  async createSubscription(params: {
    externalCustomerId: string
    billingType: string
    value: number       // centavos
    nextDueDate: string
    cycle: string
    description: string
    externalReference?: string
    maxPayments?: number
  }): Promise<AsaasSubscription> {
    const { data } = await this.client.post('/subscriptions', {
      customer: params.externalCustomerId,
      billingType: params.billingType,
      value: params.value / 100,
      nextDueDate: params.nextDueDate,
      cycle: params.cycle,
      description: params.description,
      externalReference: params.externalReference,
      maxPayments: params.maxPayments,
    })
    this.logger.log(`Asaas subscription criada: ${data.id}`)
    return data
  }

  async cancelSubscription(externalSubId: string): Promise<void> {
    await this.client.delete(`/subscriptions/${externalSubId}`)
  }

  async getSubscription(externalSubId: string): Promise<AsaasSubscription> {
    const { data } = await this.client.get(`/subscriptions/${externalSubId}`)
    return data
  }

  // ─── Estorno ──────────────────────────────────────────────────────────────

  async refundPayment(externalChargeId: string, value?: number): Promise<void> {
    await this.client.post(`/payments/${externalChargeId}/refund`, {
      value: value ? value / 100 : undefined,
    })
  }

  // ─── Mapear intervalo de plano → ciclo Asaas ──────────────────────────────

  static intervalToCycle(unit: string, count: number): string {
    if (unit === 'week')  return 'WEEKLY'
    if (unit === 'month') {
      if (count === 1)  return 'MONTHLY'
      if (count === 2)  return 'BIWEEKLY'
      if (count === 3)  return 'QUARTERLY'
      if (count === 6)  return 'SEMIANNUALLY'
    }
    if (unit === 'year')  return 'YEARLY'
    return 'MONTHLY'
  }
}
