import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { License } from './entities/license.entity'

@Injectable()
export class LicensesRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: Partial<License>): Promise<License> {
    const [row] = await this.sql`
      INSERT INTO licenses (
        customer_id, product_id, plan_id,
        origin_type, origin_id, status,
        starts_at, expires_at, grace_until,
        max_users, feature_set
      ) VALUES (
        ${data.customerId}, ${data.productId}, ${data.planId ?? null},
        ${data.originType}::license_origin, ${data.originId},
        ${data.status ?? 'active'}::license_status,
        ${data.startsAt ?? new Date()},
        ${data.expiresAt ?? null},
        ${data.graceUntil ?? null},
        ${data.maxUsers ?? null},
        ${JSON.stringify(data.featureSet ?? {})}
      )
      RETURNING *
    `
    return this.map(row)
  }

  async findById(id: string): Promise<License | null> {
    const [row] = await this.sql`
      SELECT
        l.*,
        p.code  AS product_code,
        p.name  AS product_name,
        pl.code AS plan_code,
        pl.name AS plan_name
      FROM licenses l
      JOIN products p   ON p.id  = l.product_id
      LEFT JOIN plans pl ON pl.id = l.plan_id
      WHERE l.id = ${id}
    `
    return row ? this.map(row) : null
  }

  async findActiveByCustomerAndProduct(
    customerId: string,
    productId: string,
  ): Promise<License | null> {
    const [row] = await this.sql`
      SELECT l.*, p.code AS product_code, pl.code AS plan_code
      FROM licenses l
      JOIN products p   ON p.id  = l.product_id
      LEFT JOIN plans pl ON pl.id = l.plan_id
      WHERE l.customer_id = ${customerId}
        AND l.product_id  = ${productId}
        AND l.status IN ('active', 'suspended')
      ORDER BY l.created_at DESC
      LIMIT 1
    `
    return row ? this.map(row) : null
  }

  async findAllByCustomer(customerId: string): Promise<License[]> {
    const rows = await this.sql`
      SELECT
        l.*,
        p.code AS product_code,
        p.name AS product_name,
        pl.code AS plan_code,
        pl.name AS plan_name
      FROM licenses l
      JOIN products p   ON p.id  = l.product_id
      LEFT JOIN plans pl ON pl.id = l.plan_id
      WHERE l.customer_id = ${customerId}
      ORDER BY p.name, l.created_at DESC
    `
    return rows.map(this.map)
  }

  async findExpiredAfterGrace(now: Date): Promise<License[]> {
    const rows = await this.sql`
      SELECT * FROM licenses
      WHERE status = 'active'
        AND expires_at IS NOT NULL
        AND grace_until IS NOT NULL
        AND grace_until < ${now}
    `
    return rows.map(this.map)
  }

  async update(id: string, data: Partial<License>): Promise<License> {
    const [row] = await this.sql`
      UPDATE licenses SET
        status          = COALESCE(${data.status ?? null}::license_status, status),
        starts_at       = COALESCE(${data.startsAt ?? null}, starts_at),
        expires_at      = CASE WHEN ${data.expiresAt !== undefined}
                          THEN ${data.expiresAt ?? null}
                          ELSE expires_at END,
        grace_until     = CASE WHEN ${data.graceUntil !== undefined}
                          THEN ${data.graceUntil ?? null}
                          ELSE grace_until END,
        plan_id         = COALESCE(${data.planId ?? null}, plan_id),
        max_users       = COALESCE(${data.maxUsers ?? null}, max_users),
        feature_set     = COALESCE(${data.featureSet ? JSON.stringify(data.featureSet) : null}::jsonb, feature_set),
        suspended_at    = CASE WHEN ${data.suspendedAt !== undefined}
                          THEN ${data.suspendedAt ?? null}
                          ELSE suspended_at END,
        suspended_reason = CASE WHEN ${data.suspendedReason !== undefined}
                           THEN ${data.suspendedReason ?? null}
                           ELSE suspended_reason END,
        revoked_at      = CASE WHEN ${data.revokedAt !== undefined}
                          THEN ${data.revokedAt ?? null}
                          ELSE revoked_at END,
        revoked_reason  = CASE WHEN ${data.revokedReason !== undefined}
                          THEN ${data.revokedReason ?? null}
                          ELSE revoked_reason END
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  private map(row: any): License {
    return {
      id:              row.id,
      customerId:      row.customer_id,
      productId:       row.product_id,
      planId:          row.plan_id,
      originType:      row.origin_type,
      originId:        row.origin_id,
      status:          row.status,
      startsAt:        row.starts_at,
      expiresAt:       row.expires_at,
      graceUntil:      row.grace_until,
      maxUsers:        row.max_users,
      featureSet:      row.feature_set,
      suspendedAt:     row.suspended_at,
      suspendedReason: row.suspended_reason,
      revokedAt:       row.revoked_at,
      revokedReason:   row.revoked_reason,
      createdAt:       row.created_at,
      updatedAt:       row.updated_at,
      // joins
      product: row.product_code ? { code: row.product_code, name: row.product_name } : undefined,
      plan:    row.plan_code    ? { code: row.plan_code,    name: row.plan_name    } : undefined,
    }
  }
}
