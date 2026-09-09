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

  const dtoBase = {
    personType: 'PJ',
    legalName: 'Empresa',
    phone: '11999999999',
    addressZip: '60000-000',
    addressStreet: 'Rua A',
    addressNumber: '100',
    addressDistrict: 'Centro',
    addressCity: 'Fortaleza',
    addressState: 'CE',
  }

  it('deve retornar existente por e-mail', async () => {
    repo.findByEmail.mockResolvedValue({ id: 'cust-1' })
    const result = await service.upsert({
      ...dtoBase,
      document: '11.222.333/0001-81',
      email: 'financeiro@empresa.com.br',
    } as any)

    expect(result).toEqual({ exists: true, source: 'existing', customerId: 'cust-1' })
    expect(repo.create).not.toHaveBeenCalled()
  })

  // Este e o caso que originou a mudanca: a mesma pessoa, com o mesmo
  // documento, criando uma segunda conta no satelite. Antes o upsert devolvia o
  // customerId da primeira e o satelite recusava o checkout com
  // "CPF/CNPJ ja vinculado a outro cadastro".
  it('mesmo documento com e-mail diferente deve criar OUTRO cliente', async () => {
    repo.findByEmail.mockResolvedValue(null)
    repo.create.mockResolvedValue({ id: 'cust-2' })

    const result = await service.upsert({
      ...dtoBase,
      document: '11.222.333/0001-81',
      email: 'segunda-conta@empresa.com.br',
    } as any)

    expect(result).toEqual({ exists: true, source: 'created', customerId: 'cust-2' })
    expect(repo.findByDocument).not.toHaveBeenCalled()
    expect(repo.create).toHaveBeenCalled()
  })

  // Venda fora do Brasil: nao ha CPF/CNPJ e o pagamento e por cartao.
  it('deve aceitar cliente sem documento e gerar identificador interno', async () => {
    repo.findByEmail.mockResolvedValue(null)
    repo.create.mockResolvedValue({ id: 'cust-3' })

    const result = await service.upsert({
      ...dtoBase,
      personType: 'PF',
      email: 'cliente@exterior.com',
    } as any)

    expect(result).toEqual({ exists: true, source: 'created', customerId: 'cust-3' })
    const enviado = (repo.create as any).mock.calls[0][0]
    expect(enviado.documentClean).toMatch(/^9[0-9]{10}$/)
  })

  it('deve criar quando não existir', async () => {
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
