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
}
