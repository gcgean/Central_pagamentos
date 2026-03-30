import { Injectable, Logger } from '@nestjs/common'
import { LicensesService } from '../licenses/licenses.service'
import { CustomersService } from '../customers/customers.service'
import { CustomersRepository } from '../customers/customers.repository'
import { ProductsService } from '../products/products.service'
import { cleanDocument, validateDocument } from '../../shared/utils/document.util'
import {
  AccessStatus,
  AccessStatusResponseDto,
  ResolveAccessDto,
  ResolveAccessResponseDto,
} from './dto/resolve-access.dto'
import dayjs from 'dayjs'

export interface AccessValidationResult {
  customerId: string
  productCode: string
  allowed: boolean
  reason?: string
  licenseId?: string
  licenseStatus?: string
  planCode?: string
  expiresAt?: string | null
  features?: Record<string, unknown>
  checkedAt: string
}

@Injectable()
export class AccessService {

  private readonly logger = new Logger(AccessService.name)

  constructor(
    private readonly licenses: LicensesService,
    private readonly customers: CustomersService,
    private readonly customersRepo: CustomersRepository,
    private readonly products: ProductsService,
  ) {}

  // ─── Endpoint legado: validate por customerId + productCode ───────────────

  async validate(customerId: string, productCode: string): Promise<AccessValidationResult> {
    const base = { customerId, productCode, checkedAt: new Date().toISOString() }

    let customer
    try {
      customer = await this.customers.findById(customerId)
    } catch {
      return { ...base, allowed: false, reason: 'customer_not_found' }
    }

    if (customer.status === 'blocked') {
      return { ...base, allowed: false, reason: 'customer_blocked' }
    }

    let product
    try {
      product = await this.products.findByCode(productCode)
    } catch {
      return { ...base, allowed: false, reason: 'product_not_found' }
    }

    const license = await this.licenses.findByCustomerAndProduct(customerId, product.id)

    if (!license) {
      return { ...base, allowed: false, reason: 'no_license' }
    }

    if (license.status === 'revoked') {
      return { ...base, allowed: false, reason: 'license_revoked', licenseId: license.id }
    }

    if (license.status === 'suspended') {
      if (license.graceUntil && dayjs().isBefore(license.graceUntil)) {
        this.logger.log(`Acesso via carência: cliente ${customerId} produto ${productCode}`)
        return {
          ...base,
          allowed: true,
          reason: 'grace_period',
          licenseId: license.id,
          licenseStatus: 'grace_period',
          expiresAt: license.graceUntil?.toISOString(),
          features: license.featureSet,
        }
      }
      return { ...base, allowed: false, reason: 'license_suspended', licenseId: license.id }
    }

    if (license.status === 'expired') {
      return { ...base, allowed: false, reason: 'license_expired', licenseId: license.id }
    }

    if (license.status === 'inactive') {
      return { ...base, allowed: false, reason: 'license_inactive', licenseId: license.id }
    }

    if (license.expiresAt && dayjs().isAfter(license.expiresAt)) {
      if (license.graceUntil && dayjs().isBefore(license.graceUntil)) {
        return {
          ...base,
          allowed: true,
          reason: 'grace_period',
          licenseId: license.id,
          licenseStatus: 'grace_period',
          expiresAt: license.graceUntil?.toISOString(),
          features: license.featureSet,
        }
      }
      return { ...base, allowed: false, reason: 'license_expired', licenseId: license.id }
    }

    return {
      ...base,
      allowed: true,
      licenseId: license.id,
      licenseStatus: license.status,
      planCode: license.plan?.code,
      expiresAt: license.expiresAt?.toISOString() ?? null,
      features: {
        ...(license.featureSet ?? {}),
        max_users: license.maxUsers,
      },
    }
  }

  async getEntitlements(customerId: string) {
    const licenses = await this.licenses.findAllByCustomer(customerId)

    return {
      customerId,
      checkedAt: new Date().toISOString(),
      products: licenses.map(l => ({
        productId: l.productId,
        productCode: l.product?.code,
        licenseId: l.id,
        allowed: l.status === 'active',
        licenseStatus: l.status,
        expiresAt: l.expiresAt?.toISOString() ?? null,
        features: l.featureSet,
      })),
    }
  }

  // ─── POST /access/resolve ─────────────────────────────────────────────────
  //
  // Fluxo completo de resolução de acesso para sistemas satélites:
  //   1. Localiza ou cria cliente pelo documento (idempotente)
  //   2. Verifica licença paga ativa → retorna 'licensed'
  //   3. Verifica trial existente:
  //      - ativo → retorna 'trial'
  //      - expirado → retorna 'blocked' (trial_expired)
  //   4. Sem trial e sem licença → inicia trial se produto tiver trial_days > 0
  //   5. Sem trial configurado → retorna 'no_license'
  //
  async resolveAccess(dto: ResolveAccessDto): Promise<ResolveAccessResponseDto> {
    const documentClean = cleanDocument(dto.document)

    // Valida documento antes de qualquer coisa
    if (!validateDocument(documentClean, dto.personType)) {
      // Retorna blocked sem criar nada — documento inválido é falha do caller
      return {
        customerId: '',
        productId: dto.productId,
        licenseId: null,
        accessStatus: 'blocked',
        trialStartedAt: null,
        trialEndAt: null,
        licenseEndAt: null,
        daysLeft: null,
        canAccess: false,
        banner: 'Documento inválido. Verifique o CPF ou CNPJ informado.',
      }
    }

    // 1. Localizar ou criar cliente
    let customer = await this.customersRepo.findByDocument(documentClean)
    if (!customer) {
      const email = dto.email.trim().toLowerCase()
      customer = await this.customersRepo.findByEmail(email) ?? null
      if (!customer) {
        customer = await this.customersRepo.create({
          personType: dto.personType,
          document: dto.document,
          documentClean,
          legalName: dto.name,
          email,
        })
        this.logger.log(`Cliente criado via resolve: ${customer.id} (doc: ***${documentClean.slice(-4)})`)
      }
    }

    if (customer.status === 'blocked') {
      return this.buildResponse(customer.id, dto.productId, null, 'blocked', 'customer_blocked', null)
    }

    // 2. Verificar licença ativa (paga ou trial ativo)
    const activeLicense = await this.licenses.findByCustomerAndProduct(customer.id, dto.productId)

    if (activeLicense) {
      const isPaidLicense = activeLicense.originType !== 'trial'

      // Licença paga ativa
      if (isPaidLicense && activeLicense.status === 'active') {
        const daysLeft = activeLicense.expiresAt
          ? Math.max(0, dayjs(activeLicense.expiresAt).diff(dayjs(), 'day'))
          : null
        return {
          customerId: customer.id,
          productId: dto.productId,
          licenseId: activeLicense.id,
          accessStatus: 'licensed',
          trialStartedAt: null,
          trialEndAt: null,
          licenseEndAt: activeLicense.expiresAt?.toISOString() ?? null,
          daysLeft,
          canAccess: true,
          banner: null,
        }
      }

      // Licença paga suspensa mas dentro da carência
      if (isPaidLicense && activeLicense.status === 'suspended') {
        if (activeLicense.graceUntil && dayjs().isBefore(activeLicense.graceUntil)) {
          const daysLeft = Math.max(0, dayjs(activeLicense.graceUntil).diff(dayjs(), 'day'))
          return {
            customerId: customer.id,
            productId: dto.productId,
            licenseId: activeLicense.id,
            accessStatus: 'licensed',
            trialStartedAt: null,
            trialEndAt: null,
            licenseEndAt: activeLicense.graceUntil.toISOString(),
            daysLeft,
            canAccess: true,
            banner: `Seu acesso está em período de carência. Regularize o pagamento. Restam ${daysLeft} dia(s).`,
          }
        }
        return this.buildResponse(customer.id, dto.productId, activeLicense.id, 'blocked', 'license_suspended', null)
      }

      // Trial ativo
      if (!isPaidLicense && activeLicense.status === 'active') {
        const daysLeft = activeLicense.expiresAt
          ? Math.max(0, dayjs(activeLicense.expiresAt).diff(dayjs(), 'day'))
          : null
        return {
          customerId: customer.id,
          productId: dto.productId,
          licenseId: activeLicense.id,
          accessStatus: 'trial',
          trialStartedAt: activeLicense.startsAt.toISOString(),
          trialEndAt: activeLicense.expiresAt?.toISOString() ?? null,
          licenseEndAt: null,
          daysLeft,
          canAccess: true,
          banner: `Você está no período de avaliação gratuita. Restam ${daysLeft} dia(s).`,
        }
      }
    }

    // 3. Verificar se trial já foi usado (qualquer status, inclusive expirado)
    const trialLicense = await this.licenses.findTrialByCustomerAndProduct(customer.id, dto.productId)

    if (trialLicense) {
      // Trial foi usado e está expirado/suspendo — bloquear
      return this.buildResponse(customer.id, dto.productId, trialLicense.id, 'blocked', 'trial_expired', {
        trialEndAt: trialLicense.expiresAt?.toISOString() ?? null,
      })
    }

    // 4. Nunca teve trial — verificar configuração do produto
    let product
    try {
      product = await this.products.findById(dto.productId)
    } catch {
      return this.buildResponse(customer.id, dto.productId, null, 'blocked', 'product_not_found', null)
    }

    if (product.trialDays > 0) {
      // Iniciar trial
      const startsAt = new Date()
      const expiresAt = dayjs().add(product.trialDays, 'day').toDate()

      const trialLic = await this.licenses.emit({
        customerId: customer.id,
        productId: dto.productId,
        originType: 'trial',
        originId: customer.id, // referência ao cliente que iniciou o trial
        startsAt,
        expiresAt,
        graceDays: 0, // trial não tem carência
        actorType: 'system',
      })

      this.logger.log(
        `Trial iniciado: customer=${customer.id} product=${dto.productId} expires=${expiresAt.toISOString()}`,
      )

      return {
        customerId: customer.id,
        productId: dto.productId,
        licenseId: trialLic.id,
        accessStatus: 'trial',
        trialStartedAt: startsAt.toISOString(),
        trialEndAt: expiresAt.toISOString(),
        licenseEndAt: null,
        daysLeft: product.trialDays,
        canAccess: true,
        banner: `Bem-vindo! Você tem ${product.trialDays} dias de avaliação gratuita.`,
      }
    }

    // 5. Sem trial configurado e sem licença
    return this.buildResponse(customer.id, dto.productId, null, 'no_license', 'no_license', null)
  }

  // ─── GET /access/status ───────────────────────────────────────────────────
  //
  // Consulta consolidada de acesso por customer_id + product_id.
  // Não cria clientes nem inicia trials — apenas informa o estado atual.
  //
  async getAccessStatus(customerId: string, productId: string): Promise<AccessStatusResponseDto> {
    // Verificar cliente
    let customer
    try {
      customer = await this.customers.findById(customerId)
    } catch {
      return this.buildStatusResponse('blocked', false, null, null, null, 'customer_not_found', null)
    }

    if (customer.status === 'blocked') {
      return this.buildStatusResponse('blocked', false, null, null, null, 'customer_blocked', null)
    }

    // Verificar produto
    let product
    try {
      product = await this.products.findById(productId)
    } catch {
      return this.buildStatusResponse('blocked', false, null, null, null, 'product_not_found', null)
    }

    // Verificar licença ativa (inclui suspended para carência)
    const activeLicense = await this.licenses.findByCustomerAndProduct(customerId, productId)

    if (activeLicense) {
      const isPaid = activeLicense.originType !== 'trial'

      if (activeLicense.status === 'revoked') {
        return this.buildStatusResponse('blocked', false, null, null, null, 'license_revoked', null)
      }

      if (activeLicense.status === 'suspended') {
        if (activeLicense.graceUntil && dayjs().isBefore(activeLicense.graceUntil)) {
          const daysLeft = Math.max(0, dayjs(activeLicense.graceUntil).diff(dayjs(), 'day'))
          return this.buildStatusResponse(
            'licensed', true,
            null,
            activeLicense.graceUntil.toISOString(),
            daysLeft,
            'grace_period',
            `Seu acesso está em carência. Regularize o pagamento. Restam ${daysLeft} dia(s).`,
          )
        }
        return this.buildStatusResponse('blocked', false, null, null, null, 'license_suspended', null)
      }

      if (activeLicense.status === 'active') {
        if (isPaid) {
          const daysLeft = activeLicense.expiresAt
            ? Math.max(0, dayjs(activeLicense.expiresAt).diff(dayjs(), 'day'))
            : null
          return this.buildStatusResponse(
            'licensed', true,
            null,
            activeLicense.expiresAt?.toISOString() ?? null,
            daysLeft,
            'licensed',
            null,
          )
        }

        // Trial ativo
        const daysLeft = activeLicense.expiresAt
          ? Math.max(0, dayjs(activeLicense.expiresAt).diff(dayjs(), 'day'))
          : null
        return this.buildStatusResponse(
          'trial', true,
          activeLicense.startsAt.toISOString(),
          activeLicense.expiresAt?.toISOString() ?? null,
          daysLeft,
          'trial_active',
          `Você está no período de avaliação gratuita. Restam ${daysLeft} dia(s).`,
        )
      }
    }

    // Verificar trial expirado
    const trialLicense = await this.licenses.findTrialByCustomerAndProduct(customerId, productId)
    if (trialLicense) {
      return this.buildStatusResponse(
        'blocked', false,
        trialLicense.startsAt.toISOString(),
        trialLicense.expiresAt?.toISOString() ?? null,
        0,
        'trial_expired',
        'Seu período de avaliação expirou. Adquira uma licença para continuar usando o sistema.',
      )
    }

    // Sem nenhum vínculo
    return this.buildStatusResponse(
      'no_license', false,
      null, null, null,
      'no_license',
      product.trialDays > 0
        ? 'Acesse o sistema para iniciar seu período de avaliação gratuita.'
        : null,
    )
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildResponse(
    customerId: string,
    productId: string,
    licenseId: string | null,
    accessStatus: AccessStatus,
    reason: string,
    extra: { trialEndAt?: string | null } | null,
  ): ResolveAccessResponseDto {
    const banners: Record<string, string> = {
      blocked: 'Acesso bloqueado. Entre em contato com o suporte.',
      trial_expired: 'Seu período de avaliação expirou. Adquira uma licença para continuar.',
      customer_blocked: 'Sua conta está bloqueada. Entre em contato com o suporte.',
      license_suspended: 'Sua licença está suspensa. Regularize o pagamento para continuar.',
      no_license: 'Produto não disponível. Entre em contato para adquirir uma licença.',
      product_not_found: 'Produto não encontrado.',
    }

    return {
      customerId,
      productId,
      licenseId,
      accessStatus,
      trialStartedAt: null,
      trialEndAt: extra?.trialEndAt ?? null,
      licenseEndAt: null,
      daysLeft: null,
      canAccess: false,
      banner: banners[reason] ?? banners['blocked'],
    }
  }

  private buildStatusResponse(
    accessStatus: AccessStatus,
    canAccess: boolean,
    trialEndAt: string | null,
    licenseEndAt: string | null,
    daysLeft: number | null,
    reason: string,
    banner: string | null,
  ): AccessStatusResponseDto {
    return {
      accessStatus,
      canAccess,
      trialEndAt,
      licenseEndAt,
      daysLeft,
      reason,
      banner,
    }
  }
}
