import { Controller, Get, UseGuards, Query, BadRequestException, NotFoundException } from '@nestjs/common'
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

  @Get('subscription-analytics')
  @ApiOperation({ summary: 'Analytics de assinaturas por produto (faturamento, churn, retenção, projeção)' })
  async getSubscriptionAnalytics(@Query('productId') productId?: string) {
    if (!productId) throw new BadRequestException('productId é obrigatório')

    const [product] = await this.sql`SELECT id, code, name FROM products WHERE id = ${productId}`
    if (!product) throw new NotFoundException('Produto não encontrado')

    const since = `date_trunc('month', NOW()) - INTERVAL '11 months'`

    // ── Faturamento por mês (pedidos pagos) ──
    const revenueRows = await this.sql`
      SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month,
             SUM(contracted_amount)::bigint AS revenue_cents,
             COUNT(*)::int AS payments
      FROM orders
      WHERE product_id = ${productId} AND status = 'paid' AND paid_at IS NOT NULL
        AND paid_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
      GROUP BY 1
    `

    // ── Novos clientes por mês (primeiro pagamento) ──
    const newRows = await this.sql`
      WITH fp AS (
        SELECT customer_id, MIN(paid_at) AS first_paid_at
        FROM orders
        WHERE product_id = ${productId} AND status = 'paid' AND paid_at IS NOT NULL
        GROUP BY customer_id
      )
      SELECT to_char(date_trunc('month', first_paid_at), 'YYYY-MM') AS month, COUNT(*)::int AS new_customers
      FROM fp
      WHERE first_paid_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
      GROUP BY 1
    `

    // ── Renovações por mês (pagamentos que não são o primeiro do cliente) ──
    const renewalRows = await this.sql`
      WITH fp AS (
        SELECT customer_id, MIN(paid_at) AS first_paid_at
        FROM orders
        WHERE product_id = ${productId} AND status = 'paid' AND paid_at IS NOT NULL
        GROUP BY customer_id
      )
      SELECT to_char(date_trunc('month', o.paid_at), 'YYYY-MM') AS month, COUNT(*)::int AS renewals
      FROM orders o
      JOIN fp ON fp.customer_id = o.customer_id
      WHERE o.product_id = ${productId} AND o.status = 'paid' AND o.paid_at > fp.first_paid_at
        AND o.paid_at >= date_trunc('month', NOW()) - INTERVAL '11 months'
      GROUP BY 1
    `

    // ── Churn por mês (licenças cujo acesso terminou e o cliente não está mais ativo) ──
    const churnRows = await this.sql`
      SELECT to_char(date_trunc('month', COALESCE(l.grace_until, l.expires_at)), 'YYYY-MM') AS month,
             COUNT(DISTINCT l.customer_id)::int AS churned
      FROM licenses l
      WHERE l.product_id = ${productId}
        AND l.expires_at IS NOT NULL
        AND COALESCE(l.grace_until, l.expires_at) < NOW()
        AND COALESCE(l.grace_until, l.expires_at) >= date_trunc('month', NOW()) - INTERVAL '11 months'
        AND NOT EXISTS (
          SELECT 1 FROM licenses l2
          WHERE l2.customer_id = l.customer_id AND l2.product_id = l.product_id
            AND l2.status = 'active' AND (l2.expires_at IS NULL OR l2.expires_at > NOW())
        )
      GROUP BY 1
    `

    // ── Snapshots atuais ──
    const [{ active_subscribers }] = await this.sql`
      SELECT COUNT(*)::int AS active_subscribers FROM licenses
      WHERE product_id = ${productId} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())
    `
    const [{ revenue_30d }] = await this.sql`
      SELECT COALESCE(SUM(contracted_amount), 0)::bigint AS revenue_30d FROM orders
      WHERE product_id = ${productId} AND status = 'paid' AND paid_at >= NOW() - INTERVAL '30 days'
    `
    const [{ paying_customers }] = await this.sql`
      SELECT COUNT(DISTINCT customer_id)::int AS paying_customers FROM orders
      WHERE product_id = ${productId} AND status = 'paid'
    `

    // ── Monta a série de 12 meses (preenche buracos com 0) ──
    const toMap = (rows: any[], key: string) =>
      new Map(rows.map((r) => [String(r.month), Number(r[key] || 0)]))
    const revenueMap = toMap(revenueRows, 'revenue_cents')
    const newMap = toMap(newRows, 'new_customers')
    const renewalMap = toMap(renewalRows, 'renewals')
    const churnMap = toMap(churnRows, 'churned')

    const months: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    }

    const monthly = months.map((m) => ({
      month: m,
      revenueCents: revenueMap.get(m) ?? 0,
      newCustomers: newMap.get(m) ?? 0,
      renewals: renewalMap.get(m) ?? 0,
      churned: churnMap.get(m) ?? 0,
    }))

    // ── Agregados de 12 meses ──
    const revenueLast12moCents = monthly.reduce((s, r) => s + r.revenueCents, 0)
    const newLast12mo = monthly.reduce((s, r) => s + r.newCustomers, 0)
    const churnedLast12mo = monthly.reduce((s, r) => s + r.churned, 0)
    const activeSubscribers = Number(active_subscribers || 0)
    const mrrCents = Number(revenue_30d || 0)
    const arpuCents = activeSubscribers > 0 ? Math.round(mrrCents / activeSubscribers) : 0

    // Churn/retenção: churned / base exposta ao churn no período (ativos agora + churned)
    const churnBase = activeSubscribers + churnedLast12mo
    const churnRatePct = churnBase > 0 ? Math.round((churnedLast12mo / churnBase) * 1000) / 10 : 0
    const retentionRatePct = Math.round((100 - churnRatePct) * 10) / 10

    // ── Projeção próximos 12 meses ──
    // Taxa líquida mensal a partir dos últimos 6 meses: (novos - churn) / base ativa.
    const last6 = monthly.slice(-6)
    const netAdds = last6.reduce((s, r) => s + r.newCustomers + r.renewals - r.churned, 0)
    const avgNetPerMonth = netAdds / Math.max(last6.length, 1)
    let netRate = activeSubscribers > 0 ? avgNetPerMonth / activeSubscribers : 0
    netRate = Math.max(-0.3, Math.min(0.3, netRate)) // limita a ±30%/mês
    const projFuture: { month: string; projectedRevenueCents: number }[] = []
    let projMrr = mrrCents
    for (let i = 1; i <= 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))
      projMrr = Math.round(projMrr * (1 + netRate))
      projFuture.push({
        month: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
        projectedRevenueCents: projMrr,
      })
    }
    const projectedNext12moCents = projFuture.reduce((s, r) => s + r.projectedRevenueCents, 0)

    return {
      product: { id: product.id, code: product.code, name: product.name },
      currency: 'BRL',
      generatedAt: new Date().toISOString(),
      summary: {
        activeSubscribers,
        payingCustomersAllTime: Number(paying_customers || 0),
        newLast12mo,
        churnedLast12mo,
        revenueLast12moCents,
        mrrCents,
        arpuCents,
        churnRatePct,
        retentionRatePct,
        projectedNext12moCents,
        netMonthlyGrowthPct: Math.round(netRate * 1000) / 10,
      },
      monthly,
      projection: projFuture,
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
