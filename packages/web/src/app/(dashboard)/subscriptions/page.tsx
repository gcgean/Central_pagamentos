'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
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
  customerName?: string
  productName?: string
  planName?: string
  amount: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
}

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'orange'> = {
  ACTIVE: 'green',
  INACTIVE: 'gray',
  CANCELLED: 'red',
  PENDING: 'yellow',
  TRIALING: 'blue',
  OVERDUE: 'orange',
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  CANCELLED: 'Cancelado',
  PENDING: 'Pendente',
  TRIALING: 'Trial',
  OVERDUE: 'Vencido',
}

export default function SubscriptionsPage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searched, setSearched] = useState(false)

  const { data: subscriptions, isLoading } = useQuery<Subscription[]>({
    queryKey: ['subscriptions', 'customer', customerId],
    queryFn: async () => {
      const { data } = await api.get(`/subscriptions/customer/${customerId}`)
      return data
    },
    enabled: !!customerId && searched,
  })

  const handleSearch = () => {
    if (searchInput.trim()) {
      setCustomerId(searchInput.trim())
      setSearched(true)
    }
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
              placeholder="ID do cliente (UUID)..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <Button onClick={handleSearch} variant="outline">
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
            <EmptyState icon={Zap} title="Nenhuma assinatura encontrada" description="Este cliente não possui assinaturas." />
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
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{sub.productName ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{sub.planName ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 font-medium">{formatCurrency(sub.amount)}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusColors[sub.status] ?? 'gray'}>
                          {statusLabels[sub.status] ?? sub.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {sub.currentPeriodStart
                          ? `${formatDate(sub.currentPeriodStart)} — ${formatDate(sub.currentPeriodEnd)}`
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
