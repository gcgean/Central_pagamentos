import { Injectable, Logger, BadRequestException, UnprocessableEntityException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AsaasGateway } from './gateways/asaas.gateway'
import { MercadoPagoGateway } from './gateways/mercadopago.gateway'
import { LivePixGateway } from './gateways/livepix.gateway'
import { PaymentsRepository } from './payments.repository'
import { CustomersService } from '../customers/customers.service'
import { PlansService } from '../plans/plans.service'
import { ProductsService } from '../products/products.service'
import { SettingsService } from '../settings/settings.service'
import dayjs from 'dayjs'
import { cleanDocument, validateDocument } from '../../shared/utils/document.util'

export interface CreateCheckoutParams {
  customerId: string
  productId: string
  planId: string
  originType: 'subscription' | 'order'
  originId: string
  billingType: 'PIX' | 'CREDIT_CARD'
  installmentCount?: number
  remoteIp?: string
  payerName?: string
  payerDocument?: string
  // URL para onde o cliente é redirecionado após concluir o pagamento em gateways
  // de checkout hospedado (ex: LivePix). Informada pelo sistema satélite que
  // iniciou o checkout. Se ausente, cai no endereço do próprio Hub.
  returnUrl?: string
}

@Injectable()
export class CheckoutService {

  private readonly logger = new Logger(CheckoutService.name)

  constructor(
    private readonly config: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly asaas: AsaasGateway,
    private readonly mp: MercadoPagoGateway,
    private readonly livepix: LivePixGateway,
    private readonly repo: PaymentsRepository,
    private readonly customers: CustomersService,
    private readonly plans: PlansService,
    private readonly products: ProductsService,
  ) {}

  async createCheckout(params: CreateCheckoutParams) {
    const customer = await this.customers.findById(params.customerId)
    const plan     = await this.plans.findById(params.planId)
    const product  = await this.products.findById(params.productId)

    if (plan.status !== 'active') {
      throw new BadRequestException('Plano não está disponível para contratação')
    }

    // Resolve gateway: produto (override por produto) > gateway ativo global (DB > env)
    const gwConfig = await this.settingsService.getGatewayConfig()
    const activeGateway = product.gatewayName ?? gwConfig.activeGateway

    this.logger.log(`Checkout via gateway: ${activeGateway}${product.gatewayName ? ' (override do produto)' : ''}`)

    if (activeGateway === 'mercadopago') {
      return this.createMercadoPagoCheckout(params, plan, product, customer, gwConfig)
    }

    if (activeGateway === 'livepix') {
      return this.createLivePixCheckout(params, plan, product, customer, gwConfig)
    }

    return this.createAsaasCheckout(params, plan, product, customer)
  }

  // ── MercadoPago ─────────────────────────────────────────────────────────────

  private async createMercadoPagoCheckout(
    params: CreateCheckoutParams,
    plan: any,
    product: any,
    customer: any,
    gwConfig: Awaited<ReturnType<SettingsService['getGatewayConfig']>>,
  ) {
    if (!gwConfig.mercadopago.isConfigured) {
      throw new BadRequestException(
        'Credenciais do Mercado Pago não configuradas. Acesse Configurações → Gateway.',
      )
    }

    // Inicializa cliente com credenciais do banco
    this.mp.setCredentials(gwConfig.mercadopago.accessToken, gwConfig.mercadopago.webhookSecret)

    const description = `${product.name} — ${plan.name}`
    const dueDate     = dayjs().add(3, 'day').format('YYYY-MM-DD')
    const appUrl = (this.config.get<string>('app.url', 'http://localhost:3005') || 'http://localhost:3005').replace(/\/$/, '')
    const webhookUrl = this.config.get<string>('MERCADOPAGO_WEBHOOK_URL', '').trim()

    this.logger.log(`Iniciando checkout Mercado Pago [${params.billingType}] para ${params.originType}:${params.originId}`)

    const payer = this.resolvePayerData(customer, params.billingType, params.payerName, params.payerDocument)

    if (params.billingType === 'CREDIT_CARD') {
      const preference = await this.mp.createHostedCheckout({
        title: description,
        amount: plan.amount,
        payerEmail: customer.email,
        externalReference: `${params.originType}:${params.originId}`,
        successUrl: `${appUrl}/${params.originType === 'order' ? 'orders' : 'subscriptions'}/${params.originId}`,
        pendingUrl: `${appUrl}/${params.originType === 'order' ? 'orders' : 'subscriptions'}/${params.originId}`,
        failureUrl: `${appUrl}/${params.originType === 'order' ? 'orders' : 'subscriptions'}/${params.originId}`,
        notificationUrl: webhookUrl || undefined,
        maxInstallments: params.installmentCount ?? 12,
      })

      const invoice = await this.repo.findInvoiceByOrigin(params.originType, params.originId)
      const checkoutUrl = preference.initPoint || preference.sandboxInitPoint || null
      const localCharge = await this.repo.createCharge({
        invoiceId: invoice.id,
        customerId: params.customerId,
        amount: plan.amount,
        currency: plan.currency ?? 'BRL',
        paymentMethod: 'credit_card',
        gatewayName: 'mercadopago',
        externalChargeId: preference.id,
        checkoutUrl: checkoutUrl ?? undefined,
        installmentCount: params.installmentCount ?? 1,
        attemptNumber: 1,
        maxAttempts: 3,
      })

      this.logger.log(`Checkout hospedado MP criado: charge ${localCharge.id} → preference ${preference.id}`)

      return {
        chargeId: localCharge.id,
        externalChargeId: preference.id,
        status: localCharge.status,
        checkoutUrl,
        pixCode: null,
        pixQrCode: null,
        pixPayload: null,
        boletoUrl: null,
        amount: plan.amount,
        currency: plan.currency ?? 'BRL',
        dueDate,
      }
    }

    const charge = await this.mp.createCharge({
      email:             customer.email,
      cpfCnpj:          payer.document,
      name:             payer.name,
      amount:           plan.amount,          // em centavos
      description,
      billingType:      'PIX',
      externalReference: `${params.originType}:${params.originId}`,
      installments:     params.installmentCount,
    })

    const pixData = this.mp.extractPixData(charge)

    const invoice     = await this.repo.findInvoiceByOrigin(params.originType, params.originId)
    const localCharge = await this.repo.createCharge({
      invoiceId:        invoice.id,
      customerId:       params.customerId,
      amount:           plan.amount,
      currency:         plan.currency ?? 'BRL',
      paymentMethod:    'pix',
      gatewayName:      'mercadopago',
      externalChargeId: String(charge.id),
      pixQrCode:        pixData?.qrCodeBase64,
      pixExpiresAt:     dayjs().add(24, 'hour').toDate(),
      installmentCount: params.installmentCount ?? 1,
      attemptNumber:    1,
      maxAttempts:      3,
    })

    this.logger.log(`Checkout MP criado: charge ${localCharge.id} → MP ${charge.id}`)

    await this.persistCheckoutPayerDocument(params.customerId, payer)

    return {
      chargeId:         localCharge.id,
      externalChargeId: String(charge.id),
      status:           localCharge.status,
      checkoutUrl:      null,
      pixCode:          pixData?.qrCode ?? null,
      pixQrCode:        pixData?.qrCodeBase64 ?? null,
      pixPayload:       pixData?.qrCode ?? null,
      boletoUrl:        null,
      amount:           plan.amount,
      currency:         plan.currency ?? 'BRL',
      dueDate,
    }
  }

  // ── LivePix ──────────────────────────────────────────────────────────────────
  //
  // A LivePix só oferece checkout hospedado (redirect para checkout.livepix.gg):
  // não há emissão de PIX Copia-e-Cola/QR Code direto, nem coleta de CPF/CNPJ
  // na criação da cobrança. O `billingType` recebido é usado apenas para rotular
  // a cobrança localmente — quem decide o método de pagamento é o pagador, na
  // página de checkout da LivePix.

  private async createLivePixCheckout(
    params: CreateCheckoutParams,
    plan: any,
    product: any,
    customer: any,
    gwConfig: Awaited<ReturnType<SettingsService['getGatewayConfig']>>,
  ) {
    if (!gwConfig.livepix.isConfigured) {
      throw new BadRequestException(
        'Credenciais da LivePix não configuradas. Acesse Configurações → Gateway.',
      )
    }

    this.livepix.setCredentials(gwConfig.livepix.clientId, gwConfig.livepix.clientSecret, gwConfig.livepix.scope)

    const dueDate = dayjs().add(3, 'day').format('YYYY-MM-DD')

    // Reaproveita uma cobrança LivePix pendente recente da mesma origem, em vez de
    // criar uma nova a cada clique — reduz chamadas a POST /v2/payments e protege
    // contra o rate limit / bloqueio da conta na LivePix.
    const reuseWindowMin = Number(this.config.get<string>('LIVEPIX_REUSE_WINDOW_MINUTES', '15')) || 15
    const reusable = await this.repo.findReusablePendingCharge(params.originType, params.originId, 'livepix', reuseWindowMin)
    if (reusable) {
      this.logger.log(`Reaproveitando cobrança LivePix pendente ${reusable.id} para ${params.originType}:${params.originId}`)
      return {
        chargeId: reusable.id,
        externalChargeId: reusable.external_charge_id,
        status: reusable.status,
        checkoutUrl: reusable.checkout_url,
        pixCode: null,
        pixQrCode: null,
        pixPayload: null,
        boletoUrl: null,
        amount: reusable.amount,
        currency: reusable.currency ?? 'BRL',
        dueDate,
      }
    }

    const appUrl = (this.config.get<string>('app.url', 'http://localhost:3005') || 'http://localhost:3005').replace(/\/$/, '')
    // Redirect pós-pagamento: prioriza a URL informada pelo sistema satélite
    // (ex: NoSigilo). Só aceita http(s); senão cai no endereço do próprio Hub.
    const fallbackReturnUrl = `${appUrl}/${params.originType === 'order' ? 'orders' : 'subscriptions'}/${params.originId}`
    const redirectUrl = params.returnUrl && /^https?:\/\//i.test(params.returnUrl.trim())
      ? params.returnUrl.trim()
      : fallbackReturnUrl

    this.logger.log(`Iniciando checkout LivePix para ${params.originType}:${params.originId} (redirect: ${redirectUrl})`)

    const checkout = await this.livepix.createPayment({
      amount: plan.amount,
      currency: plan.currency ?? 'BRL',
      redirectUrl,
    })

    const invoice = await this.repo.findInvoiceByOrigin(params.originType, params.originId)
    const localCharge = await this.repo.createCharge({
      invoiceId: invoice.id,
      customerId: params.customerId,
      amount: plan.amount,
      currency: plan.currency ?? 'BRL',
      paymentMethod: params.billingType.toLowerCase() as any,
      gatewayName: 'livepix',
      externalChargeId: checkout.reference,
      checkoutUrl: checkout.redirectUrl,
      installmentCount: 1,
      attemptNumber: 1,
      maxAttempts: 3,
    })

    this.logger.log(`Checkout LivePix criado: charge ${localCharge.id} → LivePix ${checkout.reference}`)

    return {
      chargeId: localCharge.id,
      externalChargeId: checkout.reference,
      status: localCharge.status,
      checkoutUrl: checkout.redirectUrl,
      pixCode: null,
      pixQrCode: null,
      pixPayload: null,
      boletoUrl: null,
      amount: plan.amount,
      currency: plan.currency ?? 'BRL',
      dueDate,
    }
  }

  // ── Asaas ────────────────────────────────────────────────────────────────────

  private async createAsaasCheckout(
    params: CreateCheckoutParams,
    plan: any,
    product: any,
    customer: any,
  ) {
    const payer = this.resolvePayerData(customer, params.billingType, params.payerName, params.payerDocument)
    if (!payer.document) {
      throw new UnprocessableEntityException({
        code: 'PAYER_DOCUMENT_REQUIRED',
        message: 'CPF/CNPJ do titular é obrigatório para gerar cobrança no gateway atual.',
        details: ['Informe payerDocument no checkout.'],
      })
    }
    const asaasCustomer = await this.asaas.createOrFindCustomer({
      name:     payer.name,
      cpfCnpj: payer.document,
      email:   customer.email,
      phone:   customer.phone ?? undefined,
    })

    const dueDate     = dayjs().add(3, 'day').format('YYYY-MM-DD')
    const description = `${product.name} — ${plan.name}`

    const charge = await this.asaas.createCharge({
      externalCustomerId: asaasCustomer.id,
      value:         plan.amount,
      dueDate,
      description,
      billingType:   params.billingType,
      externalReference: `${params.originType}:${params.originId}`,
      installmentCount: params.installmentCount,
      installmentValue: params.installmentCount
        ? Math.ceil(plan.amount / params.installmentCount)
        : undefined,
      remoteIp:             params.remoteIp,
    })

    let pixQrCode: string | undefined
    let pixPayload: string | undefined
    if (params.billingType === 'PIX') {
      const pix = await this.asaas.getPixQrCode(charge.id)
      pixQrCode = pix.encodedImage
      pixPayload = pix.payload
    }

    const invoice     = await this.repo.findInvoiceByOrigin(params.originType, params.originId)
    const localCharge = await this.repo.createCharge({
      invoiceId:        invoice.id,
      customerId:       params.customerId,
      amount:           plan.amount,
      currency:         plan.currency,
      paymentMethod:    params.billingType.toLowerCase() as any,
      gatewayName:      'asaas',
      externalChargeId: charge.id,
      checkoutUrl:      charge.invoiceUrl,
      pixQrCode,
      pixExpiresAt:     params.billingType === 'PIX'
        ? dayjs().add(24, 'hour').toDate()
        : undefined,
      boletoUrl:        undefined,
      installmentCount: params.installmentCount ?? 1,
      attemptNumber:    1,
      maxAttempts:      3,
    })

    this.logger.log(`Checkout Asaas criado: charge ${localCharge.id} → Asaas ${charge.id}`)

    await this.persistCheckoutPayerDocument(params.customerId, payer)

    return {
      chargeId:         localCharge.id,
      externalChargeId: charge.id,
      status:           localCharge.status,
      checkoutUrl:      charge.invoiceUrl,
      pixCode:          pixPayload ?? null,
      pixQrCode:        pixQrCode ?? null,
      pixPayload:       pixPayload ?? null,
      boletoUrl:        null,
      amount:           plan.amount,
      currency:         plan.currency,
      dueDate,
    }
  }

  private resolvePayerData(
    customer: any,
    billingType: 'PIX' | 'CREDIT_CARD',
    payerName?: string,
    payerDocument?: string,
  ): { name: string; document: string; shouldPersistDocument: boolean } {
    const nameFallback = String(customer?.legalName ?? customer?.name ?? '').trim()
    const name = String(payerName ?? nameFallback).trim()
    const providedDocument = cleanDocument(String(payerDocument ?? ''))
    const fallbackDocument = cleanDocument(String(customer?.documentClean ?? customer?.document ?? ''))
    const document = providedDocument || fallbackDocument

    if (billingType === 'PIX') {
      if (!name) {
        throw new UnprocessableEntityException({
          code: 'PAYER_NAME_REQUIRED',
          message: 'Nome do titular é obrigatório para gerar cobrança PIX.',
          details: ['Informe payerName no checkout.'],
        })
      }

      const personType = document.length === 11 ? 'PF' : document.length === 14 ? 'PJ' : null
      const isValid = !!personType && validateDocument(document, personType)
      if (!isValid) {
        throw new UnprocessableEntityException({
          code: 'PAYER_DOCUMENT_REQUIRED',
          message: 'CPF/CNPJ válido do titular é obrigatório para gerar cobrança PIX.',
          details: [
            'Informe payerDocument no checkout (11 dígitos para CPF ou 14 para CNPJ).',
            'Onboarding por e-mail continua suportado em /access/resolve para acesso/trial.',
          ],
        })
      }
    }

    return {
      name: name || 'Titular',
      document,
      shouldPersistDocument: !!providedDocument,
    }
  }

  private async persistCheckoutPayerDocument(
    customerId: string,
    payer: { document: string; shouldPersistDocument: boolean },
  ): Promise<void> {
    if (!payer.shouldPersistDocument || !payer.document) return
    try {
      await this.customers.persistDocumentFromCheckout(customerId, payer.document)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erro desconhecido'
      this.logger.warn(`Falha ao persistir documento do titular no cliente ${customerId}: ${message}`)
    }
  }

  // ── Assinatura recorrente ─────────────────────────────────────────────────────

  async createRecurringSubscription(params: {
    customerId: string
    productId: string
    planId: string
    subscriptionId: string
    billingType: 'PIX' | 'CREDIT_CARD'
  }) {
    const customer = await this.customers.findById(params.customerId)
    const plan     = await this.plans.findById(params.planId)
    const product  = await this.products.findById(params.productId)

    const gwConfig      = await this.settingsService.getGatewayConfig()
    const activeGateway = product.gatewayName ?? gwConfig.activeGateway

    if (activeGateway === 'mercadopago') {
      if (!gwConfig.mercadopago.isConfigured) {
        throw new BadRequestException('Credenciais do Mercado Pago não configuradas.')
      }
      this.mp.setCredentials(gwConfig.mercadopago.accessToken, gwConfig.mercadopago.webhookSecret)

      const sub = await this.mp.createSubscription({
        email:          customer.email,
        name:           customer.legalName,
        amount:         plan.amount,
        intervalUnit:   plan.intervalUnit as any,
        intervalCount:  plan.intervalCount,
        description:    `${product.name} — ${plan.name}`,
        externalReference: `subscription:${params.subscriptionId}`,
      })

      return {
        externalSubscriptionId: sub.id,
        initPoint: sub.init_point,
        nextDueDate: null,
      }
    }

    if (activeGateway === 'livepix') {
      if (!gwConfig.livepix.isConfigured) {
        throw new BadRequestException('Credenciais da LivePix não configuradas.')
      }
      this.livepix.setCredentials(gwConfig.livepix.clientId, gwConfig.livepix.clientSecret, gwConfig.livepix.scope)

      const recurrence = LivePixGateway.intervalToRecurrence(plan.intervalUnit, plan.intervalCount)
      const appUrl = (this.config.get<string>('app.url', 'http://localhost:3005') || 'http://localhost:3005').replace(/\/$/, '')

      const plan_ = await this.livepix.createOrFindPlan({
        slug: `${product.code}-${plan.code}`.toLowerCase(),
        name: `${product.name} — ${plan.name}`,
        amount: plan.amount,
        currency: plan.currency ?? 'BRL',
      })

      const sub = await this.livepix.createSubscription({
        planId: plan_.id,
        recurrence,
        subscriber: { email: customer.email },
        redirectUrl: `${appUrl}/subscriptions/${params.subscriptionId}`,
      })

      return {
        externalSubscriptionId: sub.reference,
        checkoutUrl: sub.redirectUrl,
        cycle: recurrence,
        nextDueDate: null,
      }
    }

    if (activeGateway !== 'asaas') {
      throw new BadRequestException(`Gateway "${activeGateway}" não suportado para assinaturas recorrentes.`)
    }

    const asaasCustomer = await this.asaas.createOrFindCustomer({
      name:     customer.legalName,
      cpfCnpj: customer.documentClean,
      email:   customer.email,
    })

    const cycle = AsaasGateway.intervalToCycle(plan.intervalUnit, plan.intervalCount)

    const sub = await this.asaas.createSubscription({
      externalCustomerId: asaasCustomer.id,
      billingType: params.billingType,
      value:       plan.amount,
      nextDueDate: dayjs().add(1, 'day').format('YYYY-MM-DD'),
      cycle,
      description: `${product.name} — ${plan.name}`,
      externalReference: `subscription:${params.subscriptionId}`,
    })

    return {
      externalSubscriptionId: sub.id,
      cycle,
      nextDueDate: sub.nextDueDate,
    }
  }
}
