import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { Customer } from './entities/customer.entity'

@Injectable()
export class CustomersRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: Partial<Customer> & { documentClean: string }): Promise<Customer> {
    const [row] = await this.sql`
      INSERT INTO customers (
        person_type, document, document_clean, legal_name, trade_name,
        email, phone, status,
        address_zip, address_street, address_number, address_comp,
        address_district, address_city, address_state,
        notes, metadata
      ) VALUES (
        ${data.personType}, ${data.document}, ${data.documentClean},
        ${data.legalName}, ${data.tradeName ?? null},
        ${data.email}, ${data.phone ?? null}, 'active',
        ${data.addressZip ?? null}, ${data.addressStreet ?? null},
        ${data.addressNumber ?? null}, ${data.addressComp ?? null},
        ${data.addressDistrict ?? null}, ${data.addressCity ?? null},
        ${data.addressState ?? null},
        ${data.notes ?? null}, '{}'
      )
      RETURNING *
    `
    return this.map(row)
  }

  async findById(id: string): Promise<Customer | null> {
    const [row] = await this.sql`
      SELECT * FROM customers WHERE id = ${id}
    `
    return row ? this.map(row) : null
  }

  async findByDocument(documentClean: string): Promise<Customer | null> {
    const [row] = await this.sql`
      SELECT * FROM customers WHERE document_clean = ${documentClean}
    `
    return row ? this.map(row) : null
  }

  async findAll(params: {
    page: number
    limit: number
    status?: string
    search?: string
  }): Promise<{ data: Customer[]; total: number; page: number; limit: number }> {
    const offset = (params.page - 1) * params.limit
    const status = params.status
    const search = params.search ? `%${params.search}%` : null

    const rows = await this.sql`
      SELECT * FROM customers
      WHERE
        (${status}::text IS NULL OR status = ${status}::customer_status)
        AND (
          ${search}::text IS NULL
          OR legal_name ILIKE ${search}
          OR email ILIKE ${search}
          OR document_clean ILIKE ${search}
        )
      ORDER BY created_at DESC
      LIMIT ${params.limit} OFFSET ${offset}
    `

    const [{ count }] = await this.sql`
      SELECT COUNT(*)::int AS count FROM customers
      WHERE
        (${status}::text IS NULL OR status = ${status}::customer_status)
        AND (
          ${search}::text IS NULL
          OR legal_name ILIKE ${search}
          OR email ILIKE ${search}
          OR document_clean ILIKE ${search}
        )
    `

    return {
      data: rows.map(this.map),
      total: count,
      page: params.page,
      limit: params.limit,
    }
  }

  async update(id: string, data: Partial<Customer>): Promise<Customer> {
    const [row] = await this.sql`
      UPDATE customers SET
        legal_name      = COALESCE(${data.legalName ?? null}, legal_name),
        trade_name      = COALESCE(${data.tradeName ?? null}, trade_name),
        email           = COALESCE(${data.email ?? null}, email),
        phone           = COALESCE(${data.phone ?? null}, phone),
        address_zip     = COALESCE(${data.addressZip ?? null}, address_zip),
        address_street  = COALESCE(${data.addressStreet ?? null}, address_street),
        address_number  = COALESCE(${data.addressNumber ?? null}, address_number),
        address_comp    = COALESCE(${data.addressComp ?? null}, address_comp),
        address_district= COALESCE(${data.addressDistrict ?? null}, address_district),
        address_city    = COALESCE(${data.addressCity ?? null}, address_city),
        address_state   = COALESCE(${data.addressState ?? null}, address_state),
        notes           = COALESCE(${data.notes ?? null}, notes)
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  async updateStatus(id: string, status: string, reason?: string): Promise<Customer> {
    const [row] = await this.sql`
      UPDATE customers SET
        status = ${status}::customer_status,
        notes  = CASE WHEN ${reason ?? null}::text IS NOT NULL
                 THEN COALESCE(notes, '') || E'\n[Status: ' || ${reason ?? ''} || ']'
                 ELSE notes END
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  async getCustomerProducts(customerId: string): Promise<any[]> {
    return this.sql`
      SELECT * FROM v_customer_products
      WHERE customer_id = ${customerId}
      ORDER BY product_name
    `
  }

  async getCustomerLicenses(customerId: string): Promise<any[]> {
    return this.sql`
      SELECT
        l.*,
        p.code  AS product_code,
        p.name  AS product_name,
        pl.name AS plan_name,
        pl.code AS plan_code
      FROM licenses l
      JOIN products p  ON p.id  = l.product_id
      LEFT JOIN plans pl ON pl.id = l.plan_id
      WHERE l.customer_id = ${customerId}
      ORDER BY l.created_at DESC
    `
  }

  // Mapeia snake_case do banco para camelCase da entidade
  private map(row: any): Customer {
    return {
      id: row.id,
      personType: row.person_type,
      document: row.document,
      documentClean: row.document_clean,
      legalName: row.legal_name,
      tradeName: row.trade_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      addressZip: row.address_zip,
      addressStreet: row.address_street,
      addressNumber: row.address_number,
      addressComp: row.address_comp,
      addressDistrict: row.address_district,
      addressCity: row.address_city,
      addressState: row.address_state,
      addressCountry: row.address_country,
      notes: row.notes,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}
