import { Injectable, NotFoundException, Logger, UnprocessableEntityException } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { AuditService } from '../admin/audit.service'

@Injectable()
export class OrdersService {

  private readonly logger = new Logger(OrdersService.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly audit: AuditService,
  ) {}

  async create(data: {
    customerId: string
    productId: string
    planId?: string
    amount?: number
    contractedAmount?: number
    contractedCurrency?: string
  }) {
    await this.ensureReferences(data.customerId, data.productId, data.planId)

    const contractedAmount = this.normalizeAmount(data)

    const [order] = await this.sql`
      INSERT INTO orders (
        customer_id, product_id, plan_id,
        contracted_amount, contracted_currency, status
      ) VALUES (
        ${data.customerId}, ${data.productId}, ${data.planId ?? null},
        ${contractedAmount},
        ${data.contractedCurrency ?? 'BRL'},
        'draft'::order_status
      )
      RETURNING *
    `

    await this.sql`
      INSERT INTO invoices (
        customer_id, order_id, amount, currency, due_date
      ) VALUES (
        ${data.customerId}, ${order.id},
        ${contractedAmount},
        ${data.contractedCurrency ?? 'BRL'},
        (NOW() + INTERVAL '3 days')::date
      )
    `

    await this.sql`
      UPDATE orders SET status = 'pending_payment' WHERE id = ${order.id}
    `

    this.logger.log(`Pedido criado: ${order.id}`)
    return this.findById(order.id)
  }

  private normalizeAmount(data: { contractedAmount?: number; amount?: number }): number {
    const raw = data.contractedAmount ?? data.amount
    const numeric = Number(raw)

    if (!Number.isFinite(numeric) || numeric <= 0) {
      throw new UnprocessableEntityException('Informe "contractedAmount" ou "amount" com valor maior que zero.')
    }

    // Compatibilidade: valores decimais são interpretados como reais e convertidos para centavos.
    return Number.isInteger(numeric) ? numeric : Math.round(numeric * 100)
  }

  private async ensureReferences(customerId: string, productId: string, planId?: string): Promise<void> {
    const [customer] = await this.sql`SELECT id FROM customers WHERE id = ${customerId} LIMIT 1`
    if (!customer) {
      throw new NotFoundException(`Cliente ${customerId} não encontrado`)
    }

    const [product] = await this.sql`SELECT id FROM products WHERE id = ${productId} LIMIT 1`
    if (!product) {
      throw new NotFoundException(`Produto ${productId} não encontrado`)
    }

    if (!planId) return

    const [plan] = await this.sql`
      SELECT id FROM plans
      WHERE id = ${planId}
        AND product_id = ${productId}
      LIMIT 1
    `
    if (!plan) {
      throw new UnprocessableEntityException(`Plano ${planId} não pertence ao produto ${productId}`)
    }
  }

  async findById(id: string) {
    const [row] = await this.sql`
      SELECT
        o.*,
        c.legal_name AS customer_name,
        c.email      AS customer_email,
        p.name       AS product_name,
        p.code       AS product_code,
        pl.name      AS plan_name,
        pl.code      AS plan_code,
        pl.interval_unit,
        pl.interval_count,
        pl.max_users,
        pl.feature_set
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN products  p ON p.id = o.product_id
      LEFT JOIN plans pl ON pl.id = o.plan_id
      WHERE o.id = ${id}
    `
    if (!row) throw new NotFoundException(`Pedido ${id} não encontrado`)
    return {
      id:                 row.id,
      customerId:         row.customer_id,
      productId:          row.product_id,
      planId:             row.plan_id,
      contractedAmount:   row.contracted_amount,
      contractedCurrency: row.contracted_currency,
      status:             row.status,
      paidAt:             row.paid_at,
      canceledAt:         row.canceled_at,
      createdAt:          row.created_at,
      customer: { name: row.customer_name, email: row.customer_email },
      product:  { name: row.product_name, code: row.product_code },
      plan: row.plan_name ? {
        name:          row.plan_name,
        code:          row.plan_code,
        intervalUnit:  row.interval_unit,
        intervalCount: row.interval_count,
        maxUsers:      row.max_users,
        featureSet:    row.feature_set,
      } : null,
    }
  }

  async markPaid(id: string): Promise<void> {
    await this.sql`
      UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = ${id}
    `
    this.logger.log(`Pedido pago: ${id}`)
  }

  async cancel(id: string, reason: string, actorId?: string): Promise<any> {
    const order = await this.findById(id)

    const [updated] = await this.sql`
      UPDATE orders
      SET status = 'canceled', canceled_at = NOW(), cancellation_reason = ${reason}
      WHERE id = ${id}
      RETURNING *
    `

    await this.audit.log({
      actorType: actorId ? 'admin' : 'system',
      actorId,
      action: 'order.cancel',
      entityType: 'order',
      entityId: id,
      beforeData: order,
      afterData: updated,
      note: reason,
    })

    return updated
  }

  async findByCustomer(customerId: string) {
    return this.sql`
      SELECT
        o.*,
        p.name AS product_name,
        p.code AS product_code,
        pl.name AS plan_name
      FROM orders o
      JOIN products p ON p.id = o.product_id
      LEFT JOIN plans pl ON pl.id = o.plan_id
      WHERE o.customer_id = ${customerId}
      ORDER BY o.created_at DESC
    `
  }

  async findAll() {
    return this.sql`
      SELECT
        o.id,
        o.customer_id AS "customerId",
        o.product_id AS "productId",
        o.plan_id AS "planId",
        o.status,
        o.contracted_amount AS "contractedAmount",
        o.contracted_currency AS "contractedCurrency",
        o.created_at AS "createdAt",
        c.legal_name AS "customerName",
        c.email AS "customerEmail",
        p.name AS "productName",
        p.code AS "productCode",
        pl.name AS "planName"
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      JOIN products p ON p.id = o.product_id
      LEFT JOIN plans pl ON pl.id = o.plan_id
      ORDER BY o.created_at DESC
    `
  }
}
