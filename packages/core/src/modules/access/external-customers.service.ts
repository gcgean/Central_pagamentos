import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { CustomersRepository } from '../customers/customers.repository'
import { buildSyntheticDocument, cleanDocument, validateDocument } from '../../shared/utils/document.util'
import { ExternalPersonType, UpsertExternalCustomerDto } from './dto/external-customer.dto'

@Injectable()
export class ExternalCustomersService {
  private readonly logger = new Logger(ExternalCustomersService.name)

  constructor(private readonly customers: CustomersRepository) {}

  async resolve(input: { document?: string; email?: string }) {
    const documentClean = input.document ? cleanDocument(input.document) : null
    const email = input.email?.trim().toLowerCase() ?? null

    if (!documentClean && !email) {
      throw new BadRequestException('Informe ao menos document ou email.')
    }

    // E-mail primeiro: desde a migration 008 o documento pode repetir entre
    // clientes, entao buscar por ele devolveria um dos donos ao acaso. O
    // documento fica como caminho de consulta para quem so tem esse dado.
    const byEmail = email ? await this.customers.findByEmail(email) : null
    const byDocument = !byEmail && documentClean ? await this.customers.findByDocument(documentClean) : null
    const customer = byEmail ?? byDocument

    this.logAudit('customer.resolve', {
      exists: Boolean(customer),
      document: this.maskDocument(documentClean),
      email: this.maskEmail(email),
      customerId: customer?.id ?? null,
    })

    if (!customer) return { exists: false, source: 'existing' as const, customerId: null }
    return { exists: true, source: 'existing' as const, customerId: customer.id }
  }

  async upsert(dto: UpsertExternalCustomerDto) {
    const email = dto.email.trim().toLowerCase()
    const informado = String(dto.document ?? '').trim()
    const documentClean = informado ? cleanDocument(informado) : ''

    // Documento passou a ser opcional: fora do Brasil nao existe CPF, e o
    // pagamento por cartao (Stripe/MercadoPago) nao precisa dele. Quando vem,
    // continua sendo validado — documento errado e pior que documento ausente,
    // porque so falha na hora de cobrar.
    if (documentClean && !validateDocument(documentClean, dto.personType as ExternalPersonType)) {
      throw new BadRequestException('Documento inválido para o personType informado.')
    }

    // A identidade e o e-mail. Antes a busca era pelo documento primeiro, e era
    // isso que devolvia o mesmo customerId para duas contas da mesma pessoa —
    // o satelite entao recusava o checkout da segunda.
    const existingByEmail = await this.customers.findByEmail(email)
    if (existingByEmail) {
      this.logAudit('customer.upsert.existing', {
        customerId: existingByEmail.id,
        by: 'email',
        document: this.maskDocument(documentClean),
        email: this.maskEmail(email),
      })
      return { exists: true, source: 'existing' as const, customerId: existingByEmail.id }
    }

    try {
      // Sem documento informado, gera o sintetico: a coluna e NOT NULL e o valor
      // comeca com 9, faixa inexistente em CPF/CNPJ reais.
      const documentoFinal = documentClean || buildSyntheticDocument(email, dto.personType as 'PF' | 'PJ')

      const created = await this.customers.create({
        personType: dto.personType,
        document: informado || documentoFinal,
        documentClean: documentoFinal,
        legalName: dto.legalName,
        email,
        phone: dto.phone,
        tradeName: dto.personType === 'PJ' ? dto.legalName : undefined,
        addressZip: dto.addressZip,
        addressStreet: dto.addressStreet,
        addressNumber: dto.addressNumber,
        addressComp: dto.addressComp,
        addressDistrict: dto.addressDistrict,
        addressCity: dto.addressCity,
        addressState: dto.addressState,
        notes: dto.notes,
      })

      this.logAudit('customer.upsert.created', {
        customerId: created.id,
        document: this.maskDocument(documentClean),
        email: this.maskEmail(email),
      })

      return { exists: true, source: 'created' as const, customerId: created.id }
    } catch (err: any) {
      if (err?.code === '23505') {
        // O indice unico que resta e o de e-mail (migration 008), entao a corrida
        // so pode ter sido perdida para outro upsert do MESMO e-mail.
        const existing = await this.customers.findByEmail(email)
        if (existing) {
          this.logAudit('customer.upsert.idempotent-hit', {
            customerId: existing.id,
            document: this.maskDocument(documentClean),
            email: this.maskEmail(email),
          })
          return { exists: true, source: 'existing' as const, customerId: existing.id }
        }
      }
      throw err
    }
  }

  private maskDocument(doc?: string | null) {
    if (!doc) return null
    const clean = doc.replace(/\D/g, '')
    if (clean.length <= 4) return '***'
    return `${'*'.repeat(clean.length - 4)}${clean.slice(-4)}`
  }

  private maskEmail(email?: string | null) {
    if (!email) return null
    const [name, domain] = email.split('@')
    if (!domain) return '***'
    const visible = name.slice(0, 2)
    return `${visible}${'*'.repeat(Math.max(name.length - 2, 1))}@${domain}`
  }

  private logAudit(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }))
  }
}
