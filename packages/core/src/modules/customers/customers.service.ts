import { Injectable, ConflictException, NotFoundException } from '@nestjs/common'
import { CustomersRepository } from './customers.repository'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { UpdateCustomerDto } from './dto/update-customer.dto'
import { Customer } from './entities/customer.entity'
import { buildSyntheticDocument, cleanDocument, validateDocument } from '../../shared/utils/document.util'

@Injectable()
export class CustomersService {

  constructor(private readonly repo: CustomersRepository) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const normalizedEmail = dto.email.trim().toLowerCase()
    const existingByEmail = await this.repo.findByEmail(normalizedEmail)
    if (existingByEmail) {
      throw new ConflictException(`Já existe um cliente com o e-mail ${normalizedEmail}`)
    }

    const rawDocument = dto.document?.trim()
    if (rawDocument) {
      const doc = cleanDocument(rawDocument)

      if (!validateDocument(doc, dto.personType)) {
        throw new ConflictException(`Documento inválido: ${dto.document}`)
      }

      // Documento repetido deixou de ser conflito na migration 008: a identidade
      // do cliente e o e-mail, e a mesma pessoa pode ter mais de um cadastro.
      return this.repo.create({ ...dto, email: normalizedEmail, document: rawDocument, documentClean: doc })
    }

    const synthetic = await this.generateSyntheticDocument(normalizedEmail, dto.personType)
    return this.repo.create({
      ...dto,
      email: normalizedEmail,
      document: synthetic,
      documentClean: synthetic,
      notes: dto.notes
        ? `${dto.notes}\n[Cadastro sem CPF/CNPJ: documento interno gerado automaticamente]`
        : '[Cadastro sem CPF/CNPJ: documento interno gerado automaticamente]',
    })
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

  async persistDocumentFromCheckout(customerId: string, payerDocument: string): Promise<Customer> {
    const customer = await this.findById(customerId)
    const documentClean = cleanDocument(payerDocument)
    const personType: 'PF' | 'PJ' = documentClean.length === 11 ? 'PF' : 'PJ'

    if (!validateDocument(documentClean, personType)) {
      throw new ConflictException('Documento do titular inválido para persistência')
    }

    // Antes isto barrava quando o documento ja pertencia a outro cliente, e era
    // o segundo ponto que quebrava o caso real: a pessoa com duas contas pagava
    // na segunda e recebia "documento ja pertence a outro cliente". Com o
    // e-mail como identidade, documento repetido e esperado.
    if (customer.documentClean === documentClean) {
      return customer
    }

    return this.repo.updateIdentity(customerId, {
      personType,
      document: documentClean,
      documentClean,
    })
  }

  private async generateSyntheticDocument(email: string, personType: 'PF' | 'PJ'): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const generated = buildSyntheticDocument(email, personType, attempt)
      const existing = await this.repo.findByDocument(generated)
      if (!existing) {
        return generated
      }
    }

    throw new ConflictException('Não foi possível gerar identificador interno para cliente sem documento.')
  }
}
