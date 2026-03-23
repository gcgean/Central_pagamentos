import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class InvoicesRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: {
    customerId: string
    subscriptionId?: string | null
    orderId?: string | null
    amount: number
    currency?: string
    dueDate: Date | string
    periodStart?: Date | null
    periodEnd?: Date | null
    gatewayName?: string
  }) {
    const [row] = await this.sql`
      INSERT INTO invoices (
        customer_id, subscription_id, order_id,
        amount, currency, due_date,
        period_start, period_end, gateway_name
      ) VALUES (
        ${data.customerId},
        ${data.subscriptionId ?? null},
        ${data.orderId ?? null},
        ${data.amount},
        ${data.currency ?? 'BRL'},
        ${data.dueDate},
        ${data.periodStart ?? null},
        ${data.periodEnd ?? null},
        ${data.gatewayName ?? 'asaas'}
      )
      RETURNING *
    `
    return row
  }

  async findById(id: string) {
    const [row] = await this.sql`
      SELECT i.*,
        s.customer_id AS sub_customer_id,
        s.product_id  AS sub_product_id
      FROM invoices i
      LEFT JOIN subscriptions s ON s.id = i.subscription_id
      WHERE i.id = ${id}
    `
    return row ?? null
  }

  async findInvoiceByOrigin(originType: 'subscription' | 'order', originId: string) {
    const col = originType === 'subscription' ? 'subscription_id' : 'order_id'
    const [row] = await this.sql`
      SELECT * FROM invoices
      WHERE ${this.sql(col)} = ${originId}
        AND status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    `
    // Se não existe invoice aberta, cria uma placeholder para o checkout funcionar
    if (!row) {
      throw new Error(`Nenhuma invoice aberta encontrada para ${originType} ${originId}. Crie a invoice antes do checkout.`)
    }
    return row
  }

  async updateInvoice(id: string, data: { status?: string; paidAt?: Date }) {
    const [row] = await this.sql`
      UPDATE invoices SET
        status  = COALESCE(${data.status ?? null}::invoice_status, status),
        paid_at = COALESCE(${data.paidAt ?? null}, paid_at)
      WHERE id = ${id}
      RETURNING *
    `
    return row
  }

  async createCharge(data: {
    invoiceId: string
    customerId: string
    amount: number
    currency?: string
    paymentMethod?: string
    gatewayName: string
    externalChargeId?: string
    checkoutUrl?: string
    pixQrCode?: string
    pixExpiresAt?: Date
    boletoUrl?: string
    installmentCount?: number
    attemptNumber?: number
    maxAttempts?: number
  }) {
    const [row] = await this.sql`
      INSERT INTO charges (
        invoice_id, customer_id, amount, currency,
        payment_method, gateway_name, external_charge_id,
        checkout_url, pix_qr_code, pix_expires_at,
        boleto_url, installment_count,
        attempt_number, max_attempts, status
      ) VALUES (
        ${data.invoiceId}, ${data.customerId}, ${data.amount},
        ${data.currency ?? 'BRL'},
        ${data.paymentMethod ?? null},
        ${data.gatewayName}, ${data.externalChargeId ?? null},
        ${data.checkoutUrl ?? null},
        ${data.pixQrCode ?? null},
        ${data.pixExpiresAt ?? null},
        ${data.boletoUrl ?? null},
        ${data.installmentCount ?? 1},
        ${data.attemptNumber ?? 1},
        ${data.maxAttempts ?? 3},
        'pending'::charge_status
      )
      RETURNING *
    `
    return row
  }

  async findChargeByExternalId(gatewayName: string, externalChargeId: string) {
    const [row] = await this.sql`
      SELECT * FROM charges
      WHERE gateway_name = ${gatewayName}
        AND external_charge_id = ${externalChargeId}
    `
    return row ?? null
  }

  async updateCharge(id: string, data: {
    status?: string
    paidAt?: Date
    failedReason?: string
    nextRetryAt?: Date | null
  }) {
    const [row] = await this.sql`
      UPDATE charges SET
        status       = COALESCE(${data.status ?? null}::charge_status, status),
        paid_at      = COALESCE(${data.paidAt ?? null}, paid_at),
        failed_reason = COALESCE(${data.failedReason ?? null}, failed_reason),
        next_retry_at = CASE WHEN ${data.nextRetryAt !== undefined}
                        THEN ${data.nextRetryAt ?? null}
                        ELSE next_retry_at END
      WHERE id = ${id}
      RETURNING *
    `
    return row
  }

  async createPayment(data: {
    chargeId: string
    customerId: string
    amount: number
    currency?: string
    paymentMethod: string
    status: string
    externalPaymentId?: string
    gatewayName: string
    capturedAt?: Date
    rawPayload?: any
  }) {
    const [row] = await this.sql`
      INSERT INTO payments (
        charge_id, customer_id, amount, currency,
        payment_method, status, external_payment_id,
        gateway_name, captured_at, raw_payload
      ) VALUES (
        ${data.chargeId}, ${data.customerId}, ${data.amount},
        ${data.currency ?? 'BRL'},
        ${data.paymentMethod}::payment_method,
        ${data.status}::payment_status,
        ${data.externalPaymentId ?? null},
        ${data.gatewayName},
        ${data.capturedAt ?? null},
        ${data.rawPayload ? JSON.stringify(data.rawPayload) : null}
      )
      RETURNING *
    `
    return row
  }
}
