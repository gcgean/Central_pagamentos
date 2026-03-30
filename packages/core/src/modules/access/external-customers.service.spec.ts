import { BadRequestException } from '@nestjs/common'
import { ExternalCustomersService } from './external-customers.service'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

describe('ExternalCustomersService', () => {
  const repo: any = {
    findByDocument: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
  }

  let service: ExternalCustomersService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new ExternalCustomersService(repo as any)
  })

  it('deve retornar existente por documento', async () => {
    repo.findByDocument.mockResolvedValue({ id: 'cust-1' })
    const result = await service.upsert({
      personType: 'PJ',
      document: '11.222.333/0001-81',
      legalName: 'Empresa',
      email: 'financeiro@empresa.com.br',
      phone: '11999999999',
      addressZip: '60000-000',
      addressStreet: 'Rua A',
      addressNumber: '100',
      addressDistrict: 'Centro',
      addressCity: 'Fortaleza',
      addressState: 'CE',
    } as any)

    expect(result).toEqual({ exists: true, source: 'existing', customerId: 'cust-1' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('deve criar quando não existir', async () => {
    repo.findByDocument.mockResolvedValue(null)
    repo.findByEmail.mockResolvedValue(null)
    repo.create.mockResolvedValue({ id: 'cust-new' })

    const result = await service.upsert({
      personType: 'PJ',
      document: '11.222.333/0001-81',
      legalName: 'Empresa Nova',
      email: 'novo@empresa.com.br',
      phone: '11999999999',
      addressZip: '60000-000',
      addressStreet: 'Rua B',
      addressNumber: '10',
      addressDistrict: 'Centro',
      addressCity: 'Fortaleza',
      addressState: 'CE',
    } as any)

    expect(result).toEqual({ exists: true, source: 'created', customerId: 'cust-new' })
    expect(repo.create).toHaveBeenCalled()
  })

  it('deve validar documento inválido', async () => {
    await expect(service.upsert({
      personType: 'PJ',
      document: '123',
      legalName: 'X',
      email: 'x@x.com',
      phone: '1',
      addressZip: '1',
      addressStreet: 'A',
      addressNumber: '1',
      addressDistrict: 'A',
      addressCity: 'A',
      addressState: 'CE',
    } as any)).rejects.toBeInstanceOf(BadRequestException)
  })
})
