import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { Subscription } from './entities/subscription.entity'

@Injectable()
export class SubscriptionsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: Partial<Subscription>): Promise<Subscription> {
    const [row] = await this.sql`
      INSERT INTO subscriptions (
        customer_id, product_id, plan_id,
        contracted_amount, contracted_currency,
        status, started_at, trial_ends_at
      ) VALUES (
        ${data.customerId ?? null}, ${data.productId ?? null}, ${data.planId ?? null},
        ${data.contractedAmount ?? null}, ${data.contractedCurrency ?? 'BRL'},
        ${data.status ?? 'pending'}::subscription_status,
        ${data.startedAt ?? null},
        ${data.trialEndsAt ?? null}
      )
      RETURNING *
    `

    // Cria invoice inicial (status open, aguardando pagamento)
    await this.sql`
      INSERT INTO invoices (customer_id, subscription_id, amount, currency, due_date)
      VALUES (
        ${data.customerId ?? null}, ${row.id},
        ${data.contractedAmount ?? null},
        ${data.contractedCurrency ?? 'BRL'},
        (NOW() + INTERVAL '3 days')::date
      )
    `

    return this.findById(row.id) as Promise<Subscription>
  }

  async findById(id: string): Promise<Subscription | null> {
    const [row] = await this.sql`
      SELECT
        s.*,
        c.legal_name AS customer_name,
        c.email      AS customer_email,
        p.name       AS product_name,
        p.code       AS product_code,
        pl.name      AS plan_name,
        pl.code      AS plan_code,
        pl.amount    AS plan_amount,
        pl.interval_unit,
        pl.interval_count,
        pl.max_users,
        pl.feature_set
      FROM subscriptions s
      JOIN customers c  ON c.id  = s.customer_id
      JOIN products  p  ON p.id  = s.product_id
      JOIN plans     pl ON pl.id = s.plan_id
      WHERE s.id = ${id}
    `
    return row ? this.map(row) : null
  }

  async findByCustomer(customerId: string): Promise<Subscription[]> {
    const rows = await this.sql`
      SELECT s.*, p.name AS product_name, p.code AS product_code,
             pl.name AS plan_name, pl.code AS plan_code
      FROM subscriptions s
      JOIN products  p  ON p.id  = s.product_id
      JOIN plans     pl ON pl.id = s.plan_id
      WHERE s.customer_id = ${customerId}
      ORDER BY s.created_at DESC
    `
    return rows.map(this.map)
  }

  async findAll(): Promise<Subscription[]> {
    const rows = await this.sql`
      SELECT s.*, p.name AS product_name, p.code AS product_code,
             pl.name AS plan_name, pl.code AS plan_code
      FROM subscriptions s
      JOIN products  p  ON p.id  = s.product_id
      JOIN plans     pl ON pl.id = s.plan_id
      ORDER BY s.created_at DESC
    `
    return rows.map(this.map)
  }

  async findActiveByCustomerAndProduct(
    customerId: string,
    productId: string,
  ): Promise<Subscription | null> {
    const [row] = await this.sql`
      SELECT * FROM subscriptions
      WHERE customer_id = ${customerId}
        AND product_id  = ${productId}
        AND status NOT IN ('canceled', 'expired')
      LIMIT 1
    `
    return row ? this.map(row) : null
  }

  async findByExternalId(externalId: string): Promise<Subscription | null> {
    const [row] = await this.sql`
      SELECT * FROM subscriptions
      WHERE external_subscription_id = ${externalId}
    `
    return row ? this.map(row) : null
  }

  async update(id: string, data: Partial<Subscription>): Promise<Subscription> {
    const [row] = await this.sql`
      UPDATE subscriptions SET
        status               = COALESCE(${data.status ?? null}::subscription_status, status),
        plan_id              = COALESCE(${data.planId ?? null}, plan_id),
        contracted_amount    = COALESCE(${data.contractedAmount ?? null}, contracted_amount),
        started_at           = COALESCE(${data.startedAt ?? null}, started_at),
        trial_ends_at        = COALESCE(${data.trialEndsAt ?? null}, trial_ends_at),
        current_period_start = COALESCE(${data.currentPeriodStart ?? null}, current_period_start),
        current_period_end   = COALESCE(${data.currentPeriodEnd ?? null}, current_period_end),
        next_billing_at      = COALESCE(${data.nextBillingAt ?? null}, next_billing_at),
        canceled_at          = COALESCE(${data.canceledAt ?? null}, canceled_at),
        cancellation_reason  = COALESCE(${data.cancellationReason ?? null}, cancellation_reason),
        external_subscription_id = COALESCE(${data.externalSubscriptionId ?? null}, external_subscription_id),
        gateway_name         = COALESCE(${data.gatewayName ?? null}, gateway_name)
      WHERE id = ${id}
      RETURNING *
    `
    return this.findById(row.id) as Promise<Subscription>
  }

  private map(row: any): Subscription {
    return {
      id:                     row.id,
      customerId:             row.customer_id,
      productId:              row.product_id,
      planId:                 row.plan_id,
      contractedAmount:       row.contracted_amount,
      contractedCurrency:     row.contracted_currency,
      externalSubscriptionId: row.external_subscription_id,
      gatewayName:            row.gateway_name,
      status:                 row.status,
      startedAt:              row.started_at,
      trialEndsAt:            row.trial_ends_at,
      currentPeriodStart:     row.current_period_start,
      currentPeriodEnd:       row.current_period_end,
      nextBillingAt:          row.next_billing_at,
      canceledAt:             row.canceled_at,
      cancellationReason:     row.cancellation_reason,
      createdAt:              row.created_at,
      updatedAt:              row.updated_at,
      customer: row.customer_name
        ? { name: row.customer_name, email: row.customer_email }
        : undefined,
      product: row.product_name
        ? { name: row.product_name, code: row.product_code }
        : undefined,
      plan: row.plan_name ? {
        name:          row.plan_name,
        code:          row.plan_code,
        amount:        row.plan_amount,
        intervalUnit:  row.interval_unit,
        intervalCount: row.interval_count,
        maxUsers:      row.max_users,
        featureSet:    row.feature_set,
      } : undefined,
    }
  }
}
