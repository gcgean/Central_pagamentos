'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import {
  Users, Zap, AlertCircle, TrendingUp, ShieldCheck, Receipt,
  ArrowUpRight, ArrowDownRight
} from 'lucide-react'

interface DashboardMetrics {
  totalCustomers: number
  activeSubscriptions: number
  overdueSubscriptions: number
  mrr: number
  activeLicenses: number
  paidInvoices30d: number
}

interface MRRByProduct {
  productId: string
  productName: string
  mrr: number
  subscriptions: number
}

interface ActivityItem {
  id: string
  entityType: string
  action: string
  description: string
  createdAt: string
  adminName?: string
}

interface DashboardData {
  metrics: DashboardMetrics
  mrrByProduct: MRRByProduct[]
  recentActivity: ActivityItem[]
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  subtext?: string
}) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </CardBody>
    </Card>
  )
}

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard')
      return data
    },
  })

  if (isLoading) return <Spinner />

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">Erro ao carregar dashboard. Tente novamente.</p>
      </div>
    )
  }

  const metrics = data?.metrics
  const mrrByProduct = data?.mrrByProduct ?? []
  const recentActivity = data?.recentActivity ?? []

  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard
          label="Total de Clientes"
          value={metrics?.totalCustomers ?? 0}
          icon={Users}
          color="bg-blue-500"
        />
        <MetricCard
          label="Assinaturas Ativas"
          value={metrics?.activeSubscriptions ?? 0}
          icon={Zap}
          color="bg-green-500"
        />
        <MetricCard
          label="Assinaturas Vencidas"
          value={metrics?.overdueSubscriptions ?? 0}
          icon={AlertCircle}
          color="bg-red-500"
        />
        <MetricCard
          label="MRR"
          value={formatCurrency(metrics?.mrr ?? 0)}
          icon={TrendingUp}
          color="bg-purple-500"
          subtext="Receita Mensal Recorrente"
        />
        <MetricCard
          label="Licenças Ativas"
          value={metrics?.activeLicenses ?? 0}
          icon={ShieldCheck}
          color="bg-indigo-500"
        />
        <MetricCard
          label="Faturas Pagas (30d)"
          value={metrics?.paidInvoices30d ?? 0}
          icon={Receipt}
          color="bg-teal-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* MRR by Product */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">MRR por Produto</h2>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            {mrrByProduct.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">Nenhum dado disponível</div>
            ) : (
              mrrByProduct.map((item) => (
                <div key={item.productId} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                    <p className="text-xs text-gray-500">{item.subscriptions} assinatura(s)</p>
                  </div>
                  <span className="text-sm font-semibold text-blue-600">{formatCurrency(item.mrr)}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Atividade Recente</h2>
          </CardHeader>
          <div className="divide-y divide-gray-50">
            {recentActivity.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">Nenhuma atividade recente</div>
            ) : (
              recentActivity.slice(0, 8).map((item) => (
                <div key={item.id} className="px-6 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="blue">{item.entityType}</Badge>
                        <span className="text-xs text-gray-400">{formatDateTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
