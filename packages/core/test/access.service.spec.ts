import { Test, TestingModule } from '@nestjs/testing'
import { AccessService } from '../src/modules/access/access.service'
import { LicensesService } from '../src/modules/licenses/licenses.service'
import { CustomersService } from '../src/modules/customers/customers.service'
import { CustomersRepository } from '../src/modules/customers/customers.repository'
import { ProductsService } from '../src/modules/products/products.service'
import dayjs from 'dayjs'
import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { AccessCacheService } from '../src/shared/cache/access-cache.service'

const mockLicenses: any  = { findByCustomerAndProduct: jest.fn(), findAllByCustomer: jest.fn() }
const mockCustomers: any = { findById: jest.fn() }
const mockProducts: any  = { findByCode: jest.fn() }
const mockCustomersRepo: any = { findByDocument: jest.fn(), findByEmail: jest.fn(), create: jest.fn() }
const mockAccessCache = new AccessCacheService()

function makeCustomer(overrides = {}) {
  return { id: 'cus-001', status: 'active', legalName: 'Teste Ltda', ...overrides }
}

function makeProduct(overrides = {}) {
  return { id: 'prod-001', code: 'erp_clinico', name: 'ERP Clínico', ...overrides }
}

function makeLicense(overrides = {}) {
  return {
    id:         'lic-001',
    customerId: 'cus-001',
    productId:  'prod-001',
    status:     'active',
    expiresAt:  dayjs().add(30, 'day').toDate(),
    graceUntil: dayjs().add(37, 'day').toDate(),
    featureSet: { reports: true, api: true },
    maxUsers:   10,
    plan:       { code: 'clinico_pro' },
    ...overrides,
  }
}

describe('AccessService', () => {

  let service: AccessService

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessService,
        { provide: LicensesService,  useValue: mockLicenses  },
        { provide: CustomersService, useValue: mockCustomers },
        { provide: ProductsService,  useValue: mockProducts  },
        { provide: CustomersRepository, useValue: mockCustomersRepo },
        { provide: AccessCacheService, useValue: mockAccessCache },
      ],
    }).compile()

    service = module.get<AccessService>(AccessService)
  })

  // ── allowed ───────────────────────────────────────────────────────────────

  it('deve retornar allowed: true para licença ativa e válida', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(makeLicense())

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(true)
    expect(result.licenseStatus).toBe('active')
    expect(result.planCode).toBe('clinico_pro')
    expect(result.features).toMatchObject({ reports: true, api: true, max_users: 10 })
  })

  // ── cliente bloqueado ─────────────────────────────────────────────────────

  it('deve negar acesso a cliente bloqueado', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer({ status: 'blocked' }))

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('customer_blocked')
    // Não deve nem consultar licença
    expect(mockLicenses.findByCustomerAndProduct).not.toHaveBeenCalled()
  })

  // ── cliente inexistente ───────────────────────────────────────────────────

  it('deve negar acesso a cliente inexistente', async () => {
    mockCustomers.findById.mockRejectedValue(new Error('not found'))

    const result = await service.validate('cus-inexistente', 'erp_clinico')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('customer_not_found')
  })

  // ── sem licença ───────────────────────────────────────────────────────────

  it('deve negar acesso quando não há licença', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(null)

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('no_license')
  })

  // ── licença suspensa dentro da carência ──────────────────────────────────

  it('deve PERMITIR acesso em periodo de carência (grace_period)', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(makeLicense({
      status:     'suspended',
      graceUntil: dayjs().add(3, 'day').toDate(), // ainda em carência
    }))

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('grace_period')
    expect(result.licenseStatus).toBe('grace_period')
  })

  // ── licença suspensa fora da carência ─────────────────────────────────────

  it('deve NEGAR acesso quando carência expirou', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(makeLicense({
      status:     'suspended',
      graceUntil: dayjs().subtract(1, 'day').toDate(), // carência vencida
    }))

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('license_suspended')
  })

  // ── licença ativa mas expirada (não processada ainda) ────────────────────

  it('deve verificar grace_period mesmo para licença status=active mas expirada', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(makeLicense({
      status:     'active',
      expiresAt:  dayjs().subtract(1, 'day').toDate(), // expirou ontem
      graceUntil: dayjs().add(6, 'day').toDate(),       // mas ainda na carência
    }))

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(true)
    expect(result.reason).toBe('grace_period')
  })

  // ── licença revogada ──────────────────────────────────────────────────────

  it('deve negar acesso a licença revogada mesmo com graceUntil futuro', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockResolvedValue(makeProduct())
    mockLicenses.findByCustomerAndProduct.mockResolvedValue(makeLicense({
      status:     'revoked',
      graceUntil: dayjs().add(30, 'day').toDate(),
    }))

    const result = await service.validate('cus-001', 'erp_clinico')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('license_revoked')
  })

  // ── produto inexistente ───────────────────────────────────────────────────

  it('deve negar acesso a produto inexistente', async () => {
    mockCustomers.findById.mockResolvedValue(makeCustomer())
    mockProducts.findByCode.mockRejectedValue(new Error('not found'))

    const result = await service.validate('cus-001', 'produto_invalido')

    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('product_not_found')
  })

  // ── entitlements ──────────────────────────────────────────────────────────

  it('getEntitlements deve retornar todos os produtos do cliente', async () => {
    mockLicenses.findAllByCustomer.mockResolvedValue([
      makeLicense({ productId: 'prod-001', product: { code: 'erp_clinico' } }),
      makeLicense({ productId: 'prod-002', product: { code: 'pdv_retail' }, status: 'suspended' }),
    ])

    const result = await service.getEntitlements('cus-001')

    expect(result.products).toHaveLength(2)
    expect(result.products[0].allowed).toBe(true)
    expect(result.products[1].allowed).toBe(false) // suspended
  })
})
