import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { InvoicesService } from './invoices.service'

describe('InvoicesService', () => {
  const repo: any = {
    findLatestChargeByExternalId: jest.fn(),
    updateCharge: jest.fn(),
    createPayment: jest.fn(),
    findById: jest.fn(),
    updateInvoice: jest.fn(),
  }
  const subscriptions: any = {
    findById: jest.fn(),
    activate: jest.fn(),
    markOverdue: jest.fn(),
  }
  const licenses: any = {
    emit: jest.fn(),
    findByCustomerAndProduct: jest.fn(),
    suspend: jest.fn(),
  }
  const orders: any = { findById: jest.fn(), markPaid: jest.fn() }
  const internalEvents: any = { dispatch: jest.fn() }
  const accessCache: any = { invalidateStatus: jest.fn(), invalidateCustomer: jest.fn() }

  let service: InvoicesService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new InvoicesService(repo, subscriptions, licenses, orders, internalEvents, accessCache)
  })

  it('markPaid deve publicar payment.approved e invalidar cache de acesso', async () => {
    repo.findLatestChargeByExternalId.mockResolvedValue({
      id: 'charge-local-1',
      status: 'pending',
      customer_id: 'cust-1',
      amount: 9900,
      currency: 'BRL',
      payment_method: 'pix',
      gateway_name: 'mercadopago',
      invoice_id: 'inv-1',
    })
    repo.findById.mockResolvedValue({
      id: 'inv-1',
      subscription_id: 'sub-1',
    })
    subscriptions.findById
      .mockResolvedValueOnce({
        id: 'sub-1',
        customerId: 'cust-1',
        productId: 'prod-1',
        plan: { intervalUnit: 'month', intervalCount: 1 },
      })
      .mockResolvedValueOnce({
        id: 'sub-1',
        customerId: 'cust-1',
        productId: 'prod-1',
        plan: { intervalUnit: 'month', intervalCount: 1 },
      })

    await service.markPaid('charge-ext-1', { id: 'pay-1' })

    expect(internalEvents.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'payment.approved',
      productId: 'prod-1',
      customerId: 'cust-1',
    }))
    expect(accessCache.invalidateStatus).toHaveBeenCalledWith('cust-1', 'prod-1')
  })
})
