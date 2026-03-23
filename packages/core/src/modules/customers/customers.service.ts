import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { CustomersRepository } from './customers.repository'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { UpdateCustomerDto } from './dto/update-customer.dto'
import { Customer } from './entities/customer.entity'
import { cleanDocument, validateDocument } from '../../shared/utils/document.util'

@Injectable()
export class CustomersService {

  constructor(private readonly repo: CustomersRepository) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const doc = cleanDocument(dto.document)

    if (!validateDocument(doc, dto.personType)) {
      throw new ConflictException(`Documento inválido: ${dto.document}`)
    }

    const existing = await this.repo.findByDocument(doc)
    if (existing) {
      throw new ConflictException(`Já existe um cliente com o documento ${dto.document}`)
    }

    return this.repo.create({ ...dto, documentClean: doc })
  }

  async findById(id: string): Promise<Customer> {
    const customer = await this.repo.findById(id)
    if (!customer) throw new NotFoundException(`Cliente ${id} não encontrado`)
    return customer
  }

  async findByDocument(document: string): Promise<Customer> {
    const doc = cleanDocument(document)
    const customer = await this.repo.findByDocument(doc)
    if (!customer) throw new NotFoundException(`Cliente com documento ${document} não encontrado`)
    return customer
  }

  async findAll(params: { page: number; limit: number; status?: string; search?: string }) {
    return this.repo.findAll(params)
  }

  async update(id: string, dto: UpdateCustomerDto): Promise<Customer> {
    await this.findById(id) // garante existência
    return this.repo.update(id, dto)
  }

  async block(id: string, reason: string): Promise<Customer> {
    await this.findById(id)
    return this.repo.updateStatus(id, 'blocked', reason)
  }

  async activate(id: string): Promise<Customer> {
    await this.findById(id)
    return this.repo.updateStatus(id, 'active')
  }

  // Retorna todos os produtos/licenças ativas de um cliente
  async getProducts(customerId: string) {
    await this.findById(customerId)
    return this.repo.getCustomerProducts(customerId)
  }

  // Retorna todas as licenças de um cliente
  async getLicenses(customerId: string) {
    await this.findById(customerId)
    return this.repo.getCustomerLicenses(customerId)
  }
}
