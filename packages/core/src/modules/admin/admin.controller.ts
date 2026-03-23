import { Controller, Get, UseGuards, Query } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { AuditService } from './audit.service'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'admin', version: '1' })
export class AdminController {

  constructor(
    private readonly audit: AuditService,
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Métricas gerais do painel administrativo' })
  async getDashboard() {
    const [metrics] = await this.sql`
      SELECT
        -- Clientes
        (SELECT COUNT(*) FROM customers)::int                                         AS total_customers,
        (SELECT COUNT(*) FROM customers WHERE status = 'active')::int                 AS active_customers,

        -- Assinaturas
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'active')::int             AS active_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'overdue')::int            AS overdue_subscriptions,
        (SELECT COUNT(*) FROM subscriptions WHERE status = 'trialing')::int           AS trialing_subscriptions,
        (SELECT COUNT(*) FROM subscriptions
          WHERE status = 'canceled'
          AND canceled_at >= NOW() - INTERVAL '30 days')::int                         AS canceled_last_30d,

        -- Pedidos avulsos
        (SELECT COUNT(*) FROM orders WHERE status = 'paid')::int                      AS paid_orders,
        (SELECT COUNT(*) FROM orders WHERE status = 'pending_payment')::int           AS pending_orders,

        -- Licenças
        (SELECT COUNT(*) FROM licenses WHERE status = 'active')::int                  AS active_licenses,
        (SELECT COUNT(*) FROM licenses WHERE status = 'suspended')::int               AS suspended_licenses,

        -- Cobranças
        (SELECT COUNT(*) FROM invoices WHERE status = 'open'
          AND due_date < CURRENT_DATE)::int                                           AS overdue_invoices,
        (SELECT COUNT(*) FROM invoices
          WHERE status = 'paid'
          AND paid_at >= NOW() - INTERVAL '30 days')::int                             AS paid_invoices_30d,

        -- MRR
        (SELECT COALESCE(SUM(mrr_cents), 0) FROM v_mrr)::bigint                      AS mrr_cents
    `

    const mrrByProduct = await this.sql`
      SELECT
        product_code,
        product_name,
        active_subscriptions,
        mrr_cents
      FROM v_mrr
      ORDER BY mrr_cents DESC
    `

    const recentActivity = await this.audit.findRecent(20)

    return {
      metrics: {
        ...metrics,
        mrrFormatted: `R$ ${(Number(metrics.mrr_cents) / 100).toFixed(2)}`,
      },
      mrrByProduct,
      recentActivity,
    }
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'Consultar trilha de auditoria' })
  getAuditLogs(@Query('entityType') entityType?: string, @Query('entityId') entityId?: string) {
    if (entityType && entityId) {
      return this.audit.findByEntity(entityType, entityId)
    }
    return this.audit.findRecent(100)
  }

  @Get('webhook-events')
  @ApiOperation({ summary: 'Últimos eventos de webhook recebidos' })
  async getWebhookEvents(
    @Query('processed') processed?: string,
    @Query('limit') limit = 50,
  ) {
    const isProcessed = processed === 'true' ? true : processed === 'false' ? false : null

    return this.sql`
      SELECT
        id, gateway_name, event_type, external_event_id,
        processed, processed_at, error_message, retry_count,
        created_at
      FROM webhook_events
      WHERE (${isProcessed}::boolean IS NULL OR processed = ${isProcessed})
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }

  @Get('mrr')
  @ApiOperation({ summary: 'MRR por produto' })
  getMrr() {
    return this.sql`SELECT * FROM v_mrr ORDER BY mrr_cents DESC`
  }
}
