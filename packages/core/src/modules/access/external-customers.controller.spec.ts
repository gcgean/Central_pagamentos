import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { ExternalCustomersController } from './external-customers.controller'
import { ExternalCustomersService } from './external-customers.service'
import { validate } from 'class-validator'
import { plainToInstance } from 'class-transformer'
import { UpsertExternalCustomerDto } from './dto/external-customer.dto'

describe('ExternalCustomersController (integration)', () => {
  let controller: ExternalCustomersController
  const service: any = {
    resolve: jest.fn(),
    upsert: jest.fn(),
  }

  beforeAll(async () => {
    controller = new ExternalCustomersController(service as any)
  })

  afterAll(async () => {
    return
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('upsert deve retornar created em sucesso', async () => {
    service.upsert.mockResolvedValue({ exists: true, source: 'created', customerId: 'cust-created' })
    const result = await controller.upsert({
      personType: 'PJ',
      document: '11.222.333/0001-81',
      legalName: 'Empresa Teste',
      email: 'teste@empresa.com.br',
      phone: '11999999999',
      addressZip: '60000-000',
      addressStreet: 'Rua A',
      addressNumber: '100',
      addressDistrict: 'Centro',
      addressCity: 'Fortaleza',
      addressState: 'CE',
    } as any)
    expect(result).toEqual({ exists: true, source: 'created', customerId: 'cust-created' })
  })

  it('upsert deve retornar existing quando cliente já existe', async () => {
    service.upsert.mockResolvedValue({ exists: true, source: 'existing', customerId: 'cust-existing' })
    const result = await controller.upsert({
      personType: 'PJ',
      document: '11.222.333/0001-81',
      legalName: 'Empresa Teste',
      email: 'teste@empresa.com.br',
      phone: '11999999999',
      addressZip: '60000-000',
      addressStreet: 'Rua A',
      addressNumber: '100',
      addressDistrict: 'Centro',
      addressCity: 'Fortaleza',
      addressState: 'CE',
    } as any)
    expect(result).toEqual({ exists: true, source: 'existing', customerId: 'cust-existing' })
  })

  it('DTO deve validar campos obrigatórios', async () => {
    const dto = plainToInstance(UpsertExternalCustomerDto, {
      personType: 'PJ',
      document: '11.222.333/0001-81',
      legalName: 'Empresa Teste',
    })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
