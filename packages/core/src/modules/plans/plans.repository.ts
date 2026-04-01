import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class PlansRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: any) {
    const [row] = await this.sql`
      INSERT INTO plans (
        product_id, code, name, interval_unit, interval_count,
        amount, currency, max_users, feature_set, status
      ) VALUES (
        ${data.productId}, ${data.code}, ${data.name},
        ${data.intervalUnit ?? 'month'}, ${data.intervalCount ?? 1},
        ${data.amount}, ${data.currency ?? 'BRL'},
        ${data.maxUsers ?? null}, ${data.featureSet ?? null},
        'active'
      )
      RETURNING *
    `
    return this.map(row)
  }

  async findByProduct(productId: string) {
    const rows = await this.sql`
      SELECT * FROM plans WHERE product_id = ${productId} ORDER BY amount
    `
    return rows.map(r => this.map(r))
  }

  async findById(id: string) {
    const [row] = await this.sql`SELECT * FROM plans WHERE id = ${id}`
    return row ? this.map(row) : null
  }

  async update(id: string, data: any) {
    const [row] = await this.sql`
      UPDATE plans SET
        code          = COALESCE(${data.code ?? null}, code),
        name          = COALESCE(${data.name ?? null}, name),
        interval_unit = COALESCE(${data.intervalUnit ?? null}, interval_unit),
        interval_count= COALESCE(${data.intervalCount ?? null}, interval_count),
        amount        = COALESCE(${data.amount ?? null}, amount),
        currency      = COALESCE(${data.currency ?? null}, currency),
        max_users     = COALESCE(${data.maxUsers ?? null}, max_users),
        feature_set   = COALESCE(${data.featureSet ?? null}, feature_set),
        status        = COALESCE(${data.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  async countActiveSubscriptions(planId: string) {
    return this.sql`
      SELECT COUNT(*)::int AS count FROM subscriptions
      WHERE plan_id = ${planId} AND status IN ('active', 'trialing', 'overdue')
    `
  }

  private map(row: any) {
    return {
      id:            row.id,
      productId:     row.product_id,
      code:          row.code,
      name:          row.name,
      intervalUnit:  row.interval_unit,
      intervalCount: row.interval_count,
      amount:        row.amount,
      currency:      row.currency,
      maxUsers:      row.max_users,
      featureSet:    row.feature_set,
      status:        row.status,
      createdAt:     row.created_at,
      updatedAt:     row.updated_at,
    }
  }
}
