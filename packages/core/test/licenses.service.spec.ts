import { Test, TestingModule } from '@nestjs/testing'
import { LicensesService } from '../src/modules/licenses/licenses.service'
import { LicensesRepository } from '../src/modules/licenses/licenses.repository'
import { InternalEventsService } from '../src/modules/webhooks/internal-events.service'
import { AuditService } from '../src/modules/admin/audit.service'
import { NotFoundException } from '@nestjs/common'
import dayjs from 'dayjs'
import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { AccessCacheService } from '../src/shared/cache/access-cache.service'

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockRepo: any = {
  create: jest.fn(),
  findById: jest.fn(),
  findActiveByCustomerAndProduct: jest.fn(),
  findAllByCustomer: jest.fn(),
  findExpiredAfterGrace: jest.fn(),
  update: jest.fn(),
}

const mockEvents: any = { dispatch: jest.fn() }
const mockAudit: any  = { log: jest.fn() }
const mockAccessCache: any = { invalidateStatus: jest.fn(), invalidateCustomer: jest.fn() }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLicense(overrides = {}) {
  return {
    id:          'lic-001',
    customerId:  'cus-001',
    productId:   'prod-001',
    planId:      'plan-001',
    originType:  'subscription' as const,
    originId:    'sub-001',
    status:      'active' as const,
    startsAt:    new Date(),
    expiresAt:   dayjs().add(30, 'day').toDate(),
    graceUntil:  dayjs().add(37, 'day').toDate(),
    maxUsers:    5,
    featureSet:  { reports: true },
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  }
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('LicensesService', () => {

  let service: LicensesService

  beforeEach(async () => {
    jest.clearAllMocks()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicensesService,
        { provide: LicensesRepository,    useValue: mockRepo   },
        { provide: InternalEventsService, useValue: mockEvents },
        { provide: AuditService,          useValue: mockAudit  },
        { provide: AccessCacheService,    useValue: mockAccessCache },
      ],
    }).compile()

    service = module.get<LicensesService>(LicensesService)
  })

  // ── emit ──────────────────────────────────────────────────────────────────

  describe('emit()', () => {

    it('deve criar nova licença quando não existe nenhuma ativa', async () => {
      const license = makeLicense()
      mockRepo.findActiveByCustomerAndProduct.mockResolvedValue(null)
      mockRepo.create.mockResolvedValue(license)

      const result = await service.emit({
        customerId:  'cus-001',
        productId:   'prod-001',
        planId:      'plan-001',
        originType:  'subscription',
        originId:    'sub-001',
        expiresAt:   dayjs().add(30, 'day').toDate(),
      })

      expect(mockRepo.create).toHaveBeenCalledTimes(1)
      expect(mockEvents.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'license.activated' })
      )
      expect(result.id).toBe('lic-001')
    })

    it('deve RENOVAR (não criar) quando já existe licença ativa — RN04 isolamento', async () => {
      const existing = makeLicense()
      mockRepo.findActiveByCustomerAndProduct.mockResolvedValue(existing)
      mockRepo.findById.mockResolvedValue(existing)
      mockRepo.update.mockResolvedValue({ ...existing, expiresAt: dayjs().add(60, 'day').toDate() })

      await service.emit({
        customerId:  'cus-001',
        productId:   'prod-001',
        planId:      'plan-001',
        originType:  'subscription',
        originId:    'sub-001',
        expiresAt:   dayjs().add(60, 'day').toDate(),
      })

      // Renovou, não criou nova
      expect(mockRepo.create).not.toHaveBeenCalled()
      expect(mockRepo.update).toHaveBeenCalledWith(
        'lic-001',
        expect.objectContaining({ status: 'active' })
      )
    })

    it('deve calcular grace_until corretamente (expiresAt + graceDays)', async () => {
      mockRepo.findActiveByCustomerAndProduct.mockResolvedValue(null)
      mockRepo.create.mockResolvedValue(makeLicense())

      const expiresAt = dayjs().add(30, 'day').toDate()

      await service.emit({
        customerId: 'cus-001',
        productId:  'prod-001',
        originType: 'subscription',
        originId:   'sub-001',
        expiresAt,
        graceDays:  7,
      })

      const call: any = mockRepo.create.mock.calls[0][0]
      const expectedGrace = dayjs(expiresAt).add(7, 'day').toDate()

      expect(dayjs(call.graceUntil).diff(expectedGrace, 'minute')).toBeLessThan(1)
    })

    it('deve emitir com expiresAt null para licenças vitalícias', async () => {
      mockRepo.findActiveByCustomerAndProduct.mockResolvedValue(null)
      mockRepo.create.mockResolvedValue(makeLicense({ expiresAt: null, graceUntil: null }))

      await service.emit({
        customerId: 'cus-001',
        productId:  'prod-001',
        originType: 'order',
        originId:   'ord-001',
        expiresAt:  null,
      })

      const call: any = mockRepo.create.mock.calls[0][0]
      expect(call.expiresAt).toBeNull()
      expect(call.graceUntil).toBeNull()
    })
  })

  // ── suspend ───────────────────────────────────────────────────────────────

  describe('suspend()', () => {

    it('deve suspender licença ativa', async () => {
      const license = makeLicense({ graceUntil: dayjs().subtract(1, 'day').toDate() })
      mockRepo.findById.mockResolvedValue(license)
      mockRepo.update.mockResolvedValue({ ...license, status: 'suspended' })

      const result = await service.suspend('lic-001', 'inadimplência')

      expect(mockRepo.update).toHaveBeenCalledWith(
        'lic-001',
        expect.objectContaining({ status: 'suspended' })
      )
      expect(mockEvents.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'license.suspended' })
      )
    })

    it('NÃO deve suspender se ainda está no período de carência', async () => {
      const license = makeLicense({
        graceUntil: dayjs().add(3, 'day').toDate(), // carência futura
      })
      mockRepo.findById.mockResolvedValue(license)

      const result = await service.suspend('lic-001', 'cobrança vencida')

      // Não chama update — retorna a licença sem alterar
      expect(mockRepo.update).not.toHaveBeenCalled()
      expect(result.status).toBe('active')
    })

    it('deve ser idempotente — não processa licença já suspensa', async () => {
      const license = makeLicense({ status: 'suspended' })
      mockRepo.findById.mockResolvedValue(license)

      await service.suspend('lic-001', 'retry')

      expect(mockRepo.update).not.toHaveBeenCalled()
      expect(mockEvents.dispatch).not.toHaveBeenCalled()
    })
  })

  // ── reactivate ────────────────────────────────────────────────────────────

  describe('reactivate()', () => {

    it('deve reativar licença suspensa e despachar evento', async () => {
      const license = makeLicense({ status: 'suspended', suspendedAt: new Date() })
      mockRepo.findById.mockResolvedValue(license)
      mockRepo.update.mockResolvedValue({ ...license, status: 'active', suspendedAt: null })

      const result = await service.reactivate('lic-001', 'admin-001')

      expect(mockRepo.update).toHaveBeenCalledWith(
        'lic-001',
        expect.objectContaining({ status: 'active', suspendedAt: null })
      )
      expect(mockEvents.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'license.reactivated' })
      )
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'license.reactivate' })
      )
    })
  })

  // ── findById ──────────────────────────────────────────────────────────────

  describe('findById()', () => {

    it('deve lançar NotFoundException para ID inexistente', async () => {
      mockRepo.findById.mockResolvedValue(null)
      await expect(service.findById('not-found')).rejects.toThrow(NotFoundException)
    })

    it('deve retornar a licença quando encontrada', async () => {
      const license = makeLicense()
      mockRepo.findById.mockResolvedValue(license)
      const result = await service.findById('lic-001')
      expect(result).toEqual(license)
    })
  })

  // ── expireOverdueLicenses ─────────────────────────────────────────────────

  describe('expireOverdueLicenses()', () => {

    it('deve processar e suspender todas as licenças vencidas', async () => {
      const expired = [
        makeLicense({ id: 'lic-001', graceUntil: dayjs().subtract(2, 'day').toDate() }),
        makeLicense({ id: 'lic-002', graceUntil: dayjs().subtract(1, 'day').toDate() }),
      ]

      mockRepo.findExpiredAfterGrace.mockResolvedValue(expired)

      // suspend chama findById internamente
      mockRepo.findById.mockImplementation((id: string) =>
        Promise.resolve(expired.find(l => l.id === id) ?? null)
      )
      mockRepo.update.mockResolvedValue({ status: 'suspended' })

      const count = await service.expireOverdueLicenses()

      expect(count).toBe(2)
      expect(mockRepo.update).toHaveBeenCalledTimes(2)
    })

    it('deve retornar 0 quando não há licenças expiradas', async () => {
      mockRepo.findExpiredAfterGrace.mockResolvedValue([])
      const count = await service.expireOverdueLicenses()
      expect(count).toBe(0)
    })
  })
})
