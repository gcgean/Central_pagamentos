import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class ProductsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: any) {
    const [row] = await this.sql`
      INSERT INTO products (code, name, description, billing_type, status, trial_days, gateway_name, gateway_routing)
      VALUES (
        ${data.code},
        ${data.name},
        ${data.description ?? null},
        ${data.billingType ?? 'recurring'},
        ${data.status ?? (data.isActive === false ? 'inactive' : 'active')}::product_status,
        ${data.trialDays ?? 0},
        ${data.gatewayName ?? null},
        ${data.gatewayRouting ?? null}
      )
      RETURNING *
    `
    return this.map(row)
  }

  async findAll() {
    const rows = await this.sql`SELECT * FROM products ORDER BY name`
    return rows.map(r => this.map(r))
  }

  async findById(id: string) {
    const [row] = await this.sql`SELECT * FROM products WHERE id = ${id}`
    return row ? this.map(row) : null
  }

  async findByCode(code: string) {
    const [row] = await this.sql`SELECT * FROM products WHERE code = ${code}`
    return row ? this.map(row) : null
  }

  async update(id: string, data: any) {
    // Resolve status: aceita tanto isActive (legado) quanto status direto
    const newStatus = data.status
      ?? (data.isActive === true ? 'active' : data.isActive === false ? 'inactive' : null)

    // gateway_name aceita null explícito para reverter ao gateway padrão global —
    // por isso usa CASE (campo enviado) em vez de COALESCE (que nunca zeraria o valor).
    const gatewayNameProvided = Object.prototype.hasOwnProperty.call(data, 'gatewayName')
    const gatewayNameValue = data.gatewayName ?? null
    // Mesmo raciocínio do gateway_name: precisa aceitar null explícito para
    // remover os overrides por método de pagamento.
    const gatewayRoutingProvided = Object.prototype.hasOwnProperty.call(data, 'gatewayRouting')
    const gatewayRoutingValue = data.gatewayRouting ?? null

    const [row] = await this.sql`
      UPDATE products SET
        name         = COALESCE(${data.name ?? null}, name),
        description  = COALESCE(${data.description ?? null}, description),
        billing_type = COALESCE(${data.billingType ?? null}, billing_type),
        status       = COALESCE(${newStatus ?? null}::product_status, status),
        trial_days   = COALESCE(${data.trialDays ?? null}, trial_days),
        gateway_name = CASE WHEN ${gatewayNameProvided} THEN ${gatewayNameValue} ELSE gateway_name END,
        gateway_routing = CASE WHEN ${gatewayRoutingProvided} THEN ${gatewayRoutingValue}::jsonb ELSE gateway_routing END,
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  private map(row: any) {
    return {
      id:          row.id,
      code:        row.code,
      name:        row.name,
      description: row.description,
      billingType: row.billing_type,
      status:      row.status,
      isActive:    row.status === 'active',
      trialDays:   row.trial_days ?? 0,
      gatewayName: row.gateway_name ?? null,
      gatewayRouting: row.gateway_routing ?? null,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    }
  }
}
