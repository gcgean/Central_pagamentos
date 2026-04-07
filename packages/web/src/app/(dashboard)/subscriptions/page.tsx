'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Search, Plus, Eye, Zap } from 'lucide-react'

interface Subscription {
  id: string
  status: string
  customerId: string
  customer?: { name: string; email: string }
  product?: { name: string; code: string }
  plan?: { name: string; amount: number }
  contractedAmount?: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
}

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'orange'> = {
  active:   'green',
  inactive: 'gray',
  canceled: 'red',
  pending:  'yellow',
  trialing: 'blue',
  overdue:  'orange',
  ACTIVE: 'green', INACTIVE: 'gray', CANCELLED: 'red', PENDING: 'yellow', TRIALING: 'blue', OVERDUE: 'orange',
}

const statusLabels: Record<string, string> = {
  active:   'Ativo',
  inactive: 'Inativo',
  canceled: 'Cancelado',
  pending:  'Pendente',
  trialing: 'Trial',
  overdue:  'Vencido',
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', CANCELLED: 'Cancelado', PENDING: 'Pendente', TRIALING: 'Trial', OVERDUE: 'Vencido',
}

export default function SubscriptionsPage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searched, setSearched] = useState(false)

  const { data: subscriptions, isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'customer', customerId],
    queryFn: async () => {
      const { data } = customerId
        ? await api.get(`/subscriptions/customer/${customerId}`)
        : await api.get('/subscriptions')
      return data
    },
    enabled: searched,
  })

  const syncPendingMutation = useMutation({
    mutationFn: () => api.post('/payments/sync-pending'),
    retry: false,
  })

  const handleSearch = async () => {
    await syncPendingMutation.mutateAsync().catch(() => undefined)
    setCustomerId(searchInput.trim())
    setSearched(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Assinaturas</h2>
          <p className="text-sm text-gray-500 mt-0.5">Busque assinaturas por cliente</p>
        </div>
        <Button onClick={() => router.push('/subscriptions/new')}>
          <Plus size={16} /> Nova Assinatura
        </Button>
      </div>

      <Card>
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buscar assinaturas de um cliente
          </label>
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="ID do cliente (UUID) — opcional"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSearch()
                }
              }}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Button onClick={() => void handleSearch()} variant="outline" loading={syncPendingMutation.isPending}>
              <Search size={16} /> Buscar
            </Button>
          </div>
        </div>
      </Card>

      {searched && (
        <Card>
          {isLoading ? (
            <Spinner />
          ) : !subscriptions?.length ? (
            <EmptyState
              icon={Zap}
              title="Nenhuma assinatura encontrada"
              description={customerId ? 'Este cliente não possui assinaturas.' : 'Não há assinaturas cadastradas.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Produto</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plano</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Período</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {subscriptions.map((sub) => (
                    <tr key={sub.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{sub.product?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{sub.plan?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 font-medium">{formatCurrency(sub.contractedAmount ?? sub.plan?.amount ?? 0)}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusColors[sub.status] ?? 'gray'}>
                          {statusLabels[sub.status] ?? sub.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {sub.currentPeriodStart
                          ? `${formatDate(sub.currentPeriodStart)} — ${formatDate(sub.currentPeriodEnd ?? '')}`
                          : '—'}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/subscriptions/${sub.id}`)}>
                          <Eye size={14} /> Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
