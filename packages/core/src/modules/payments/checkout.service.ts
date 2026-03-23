import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { AsaasGateway } from './gateways/asaas.gateway'
import { PaymentsRepository } from './payments.repository'
import { CustomersService } from '../customers/customers.service'
import { PlansService } from '../plans/plans.service'
import { ProductsService } from '../products/products.service'
import dayjs from 'dayjs'

export interface CreateCheckoutParams {
  customerId: string
  productId: string
  planId: string
  originType: 'subscription' | 'order'
  originId: string
  billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'
  installmentCount?: number
  dueDate?: string
  creditCard?: any
  creditCardHolderInfo?: any
  remoteIp?: string
}

@Injectable()
export class CheckoutService {

  private readonly logger = new Logger(CheckoutService.name)

  constructor(
    private readonly asaas: AsaasGateway,
    private readonly repo: PaymentsRepository,
    private readonly customers: CustomersService,
    private readonly plans: PlansService,
    private readonly products: ProductsService,
  ) {}

  async createCheckout(params: CreateCheckoutParams) {
    const customer = await this.customers.findById(params.customerId)
    const plan = await this.plans.findById(params.planId)
    const product = await this.products.findById(params.productId)

    if (plan.status !== 'active') {
      throw new BadRequestException('Plano não está disponível para contratação')
    }

    // 1. Garante que o cliente existe no Asaas
    const asaasCustomer = await this.asaas.createOrFindCustomer({
      name: customer.legalName,
      cpfCnpj: customer.documentClean,
      email: customer.email,
      phone: customer.phone,
    })

    const dueDate = params.dueDate ?? dayjs().add(3, 'day').format('YYYY-MM-DD')
    const description = `${product.name} — ${plan.name}`

    // 2. Cria a cobrança no gateway
    const charge = await this.asaas.createCharge({
      externalCustomerId: asaasCustomer.id,
      value: plan.amount,
      dueDate,
      description,
      billingType: params.billingType,
      externalReference: `${params.originType}:${params.originId}`,
      installmentCount: params.installmentCount,
      installmentValue: params.installmentCount
        ? Math.ceil(plan.amount / params.installmentCount)
        : undefined,
      creditCard: params.creditCard,
      creditCardHolderInfo: params.creditCardHolderInfo,
      remoteIp: params.remoteIp,
    })

    // 3. Busca o QR Code Pix se necessário
    let pixQrCode: string | undefined
    let pixPayload: string | undefined
    if (params.billingType === 'PIX') {
      const pix = await this.asaas.getPixQrCode(charge.id)
      pixQrCode = pix.encodedImage
      pixPayload = pix.payload
    }

    // 4. Persiste o charge localmente (invoice já deve existir)
    const invoice = await this.repo.findInvoiceByOrigin(params.originType, params.originId)

    const localCharge = await this.repo.createCharge({
      invoiceId: invoice.id,
      customerId: params.customerId,
      amount: plan.amount,
      currency: plan.currency,
      paymentMethod: params.billingType.toLowerCase() as any,
      gatewayName: 'asaas',
      externalChargeId: charge.id,
      checkoutUrl: charge.invoiceUrl,
      pixQrCode,
      pixExpiresAt: params.billingType === 'PIX'
        ? dayjs().add(24, 'hour').toDate()
        : undefined,
      boletoUrl: charge.bankSlipUrl,
      installmentCount: params.installmentCount ?? 1,
      attemptNumber: 1,
      maxAttempts: 3,
    })

    this.logger.log(`Checkout criado: charge ${localCharge.id} → Asaas ${charge.id}`)

    return {
      chargeId: localCharge.id,
      externalChargeId: charge.id,
      checkoutUrl: charge.invoiceUrl,
      pixQrCode: pixQrCode ?? null,
      pixPayload: pixPayload ?? null,
      boletoUrl: charge.bankSlipUrl ?? null,
      amount: plan.amount,
      currency: plan.currency,
      dueDate,
    }
  }

  // Cria assinatura recorrente diretamente no gateway
  async createRecurringSubscription(params: {
    customerId: string
    productId: string
    planId: string
    subscriptionId: string
    billingType: 'PIX' | 'CREDIT_CARD' | 'BOLETO'
  }) {
    const customer = await this.customers.findById(params.customerId)
    const plan = await this.plans.findById(params.planId)
    const product = await this.products.findById(params.productId)

    const asaasCustomer = await this.asaas.createOrFindCustomer({
      name: customer.legalName,
      cpfCnpj: customer.documentClean,
      email: customer.email,
    })

    const cycle = AsaasGateway.intervalToCycle(plan.intervalUnit, plan.intervalCount)

    const sub = await this.asaas.createSubscription({
      externalCustomerId: asaasCustomer.id,
      billingType: params.billingType,
      value: plan.amount,
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
