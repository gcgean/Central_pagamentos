import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { AccessService } from './access.service'
import { AccessCacheService } from '../../shared/cache/access-cache.service'
import { AccessPersonType } from './dto/resolve-access.dto'

describe('AccessService', () => {
  let service: AccessService
  const licenses: any = {
    findByCustomerAndProduct: jest.fn(),
    findTrialByCustomerAndProduct: jest.fn(),
    findAllByCustomer: jest.fn(),
    emit: jest.fn(),
  }
  const customers: any = { findById: jest.fn() }
  const customersRepo: any = { findByDocument: jest.fn(), findByEmail: jest.fn(), create: jest.fn() }
  const products: any = { findById: jest.fn(), findByCode: jest.fn() }
  const cache = new AccessCacheService()

  beforeEach(() => {
    jest.clearAllMocks()
    service = new AccessService(licenses, customers, customersRepo, products, cache)
  })

  it('resolveAccess deve retornar reason/features quando licença paga estiver ativa', async () => {
    customersRepo.findByDocument.mockResolvedValue({ id: 'cust-1', status: 'active' })
    licenses.findByCustomerAndProduct.mockResolvedValue({
      id: 'lic-1',
      originType: 'subscription',
      status: 'active',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      featureSet: { reports: true },
      maxUsers: 12,
    })

    const result = await service.resolveAccess({
      document: '123.456.789-09',
      personType: AccessPersonType.PF,
      productId: '11111111-1111-1111-1111-111111111111',
      name: 'Teste',
      email: 'teste@hub.local',
    })

    expect(result.accessStatus).toBe('licensed')
    expect(result.reason).toBe('licensed')
    expect(result.features).toEqual({ reports: true, max_users: 12 })
  })

  it('getAccessStatus deve usar cache de 60s', async () => {
    customers.findById.mockResolvedValue({ id: 'cust-1', status: 'active' })
    products.findById.mockResolvedValue({ id: 'prod-1', trialDays: 14 })
    licenses.findByCustomerAndProduct.mockResolvedValue({
      id: 'lic-1',
      originType: 'subscription',
      status: 'active',
      expiresAt: new Date('2026-12-31T00:00:00.000Z'),
      featureSet: {},
      maxUsers: 5,
    })

    const customerId = '22222222-2222-2222-2222-222222222222'
    const productId = '33333333-3333-3333-3333-333333333333'
    const first = await service.getAccessStatus(customerId, productId)
    const second = await service.getAccessStatus(customerId, productId)

    expect(first.licenseId).toBe('lic-1')
    expect(second.licenseId).toBe('lic-1')
    expect(customers.findById).toHaveBeenCalledTimes(1)
    expect(products.findById).toHaveBeenCalledTimes(1)
    expect(licenses.findByCustomerAndProduct).toHaveBeenCalledTimes(1)
  })
})
