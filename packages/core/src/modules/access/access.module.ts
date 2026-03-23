// ── access.module.ts ─────────────────────────────────────────────────────────
import { Module } from '@nestjs/common'
import { AccessController } from './access.controller'
import { AccessService } from './access.service'
import { LicensesModule } from '../licenses/licenses.module'
import { CustomersModule } from '../customers/customers.module'
import { ProductsModule } from '../products/products.module'

@Module({
  imports: [LicensesModule, CustomersModule, ProductsModule],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}

// ── access.service.ts ─────────────────────────────────────────────────────────
import { Injectable, Logger } from '@nestjs/common'
import { LicensesService } from '../licenses/licenses.service'
import { CustomersService } from '../customers/customers.service'
import { ProductsService } from '../products/products.service'
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
    private readonly products: ProductsService,
  ) {}

  // Endpoint principal para sistemas satélites
  // GET /api/v1/access/customer/:customerId/product/:productCode
  async validate(customerId: string, productCode: string): Promise<AccessValidationResult> {
    const base = { customerId, productCode, checkedAt: new Date().toISOString() }

    // 1. Cliente existe e está ativo?
    let customer
    try {
      customer = await this.customers.findById(customerId)
    } catch {
      return { ...base, allowed: false, reason: 'customer_not_found' }
    }

    if (customer.status === 'blocked') {
      return { ...base, allowed: false, reason: 'customer_blocked' }
    }

    // 2. Produto existe?
    let product
    try {
      product = await this.products.findByCode(productCode)
    } catch {
      return { ...base, allowed: false, reason: 'product_not_found' }
    }

    // 3. Licença ativa?
    const license = await this.licenses.findByCustomerAndProduct(customerId, product.id)

    if (!license) {
      return { ...base, allowed: false, reason: 'no_license' }
    }

    // 4. Status da licença
    if (license.status === 'revoked') {
      return { ...base, allowed: false, reason: 'license_revoked', licenseId: license.id }
    }

    if (license.status === 'suspended') {
      // Verifica se ainda está no período de carência
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

    // 5. Licença ativa — verifica validade
    if (license.expiresAt && dayjs().isAfter(license.expiresAt)) {
      // Expirou mas ainda não foi processada — verifica carência
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

    // ✅ Acesso liberado
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

  // Retorna todos os entitlements de um cliente (todos os produtos)
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
}

// ── access.controller.ts ──────────────────────────────────────────────────────
import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { ApiKeyGuard } from '../../shared/guards/api-key.guard'

@ApiTags('access')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller({ path: 'access', version: '1' })
export class AccessController {

  constructor(private readonly service: AccessService) {}

  @Get('customer/:customerId/product/:productCode')
  @ApiOperation({
    summary: 'Validar acesso de um cliente a um produto',
    description: 'Endpoint principal para sistemas satélites. Retorna se o cliente pode usar o produto e quais features estão liberadas.',
  })
  validate(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('productCode') productCode: string,
  ) {
    return this.service.validate(customerId, productCode)
  }

  @Get('entitlements/:customerId')
  @ApiOperation({
    summary: 'Retorna todos os produtos/licenças de um cliente',
    description: 'Use para carregar o perfil completo de acesso do cliente em um único request.',
  })
  getEntitlements(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.service.getEntitlements(customerId)
  }
}
