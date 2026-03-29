import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class PaymentsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async findInvoiceByOrigin(originType: string, originId: string) {
    if (originType === 'subscription') {
      const [row] = await this.sql`
        SELECT * FROM invoices
        WHERE subscription_id = ${originId}
        ORDER BY created_at DESC
        LIMIT 1
      `
      return row ?? null
    }
    const [row] = await this.sql`
      SELECT * FROM invoices
      WHERE order_id = ${originId}
      ORDER BY created_at DESC
      LIMIT 1
    `
    return row ?? null
  }

  async createCharge(data: {
    invoiceId: string
    customerId: string
    amount: number
    currency: string
    paymentMethod: string
    gatewayName: string
    externalChargeId: string
    checkoutUrl?: string
    pixQrCode?: string
    pixExpiresAt?: Date
    boletoUrl?: string
    installmentCount: number
    attemptNumber: number
    maxAttempts: number
  }) {
    const [row] = await this.sql`
      INSERT INTO charges (
        invoice_id, customer_id, amount, currency,
        payment_method, gateway_name, external_charge_id,
        checkout_url, pix_qr_code, pix_expires_at, boleto_url,
        installment_count, attempt_number, max_attempts, status
      ) VALUES (
        ${data.invoiceId}, ${data.customerId}, ${data.amount}, ${data.currency},
        ${data.paymentMethod}, ${data.gatewayName}, ${data.externalChargeId},
        ${data.checkoutUrl ?? null}, ${data.pixQrCode ?? null},
        ${data.pixExpiresAt ?? null}, ${data.boletoUrl ?? null},
        ${data.installmentCount}, ${data.attemptNumber}, ${data.maxAttempts},
        'pending'
      )
      RETURNING *
    `
    return row
  }

  async findChargeByExternalId(gatewayName: string, externalChargeId: string) {
    const [row] = await this.sql`
      SELECT * FROM charges
      WHERE gateway_name = ${gatewayName} AND external_charge_id = ${externalChargeId}
    `
    return row ?? null
  }

  async findLatestChargeByExternalId(externalChargeId: string) {
    const [row] = await this.sql`
      SELECT *
      FROM charges
      WHERE external_charge_id = ${externalChargeId}
      ORDER BY created_at DESC
      LIMIT 1
    `
    return row ?? null
  }

  async listChargesByOrigin(originType: string, originId: string) {
    if (originType === 'subscription') {
      return this.sql`
        SELECT c.*
        FROM charges c
        JOIN invoices i ON i.id = c.invoice_id
        WHERE i.subscription_id = ${originId}
        ORDER BY c.created_at DESC
      `
    }
    // order
    return this.sql`
      SELECT c.*
      FROM charges c
      JOIN invoices i ON i.id = c.invoice_id
      WHERE i.order_id = ${originId}
      ORDER BY c.created_at DESC
    `
  }

  async updateChargeStatus(id: string, status: string, paidAt?: Date) {
    const [row] = await this.sql`
      UPDATE charges
      SET status = ${status}, paid_at = ${paidAt ?? null}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return row
  }

  async updateChargeStatusByExternalId(externalChargeId: string, status: string, paidAt?: Date) {
    const [row] = await this.sql`
      UPDATE charges
      SET status = ${status}, paid_at = ${paidAt ?? null}, updated_at = NOW()
      WHERE external_charge_id = ${externalChargeId}
      RETURNING *
    `
    return row
  }
}
