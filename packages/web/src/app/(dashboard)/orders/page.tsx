'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, Eye, FileText, Search } from 'lucide-react'

interface Order {
  id: string
  status: string
  customerId: string
  customer?: { name: string; email: string }
  contractedAmount: number
  createdAt: string
}

const orderSchema = z.object({
  customerId: z.string().uuid('ID do cliente inválido'),
  productId: z.string().uuid('ID do produto inválido'),
  planId: z.string().uuid('ID do plano inválido').optional().or(z.literal('')),
  contractedAmount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Valor inválido'),
})

type OrderFormData = z.infer<typeof orderSchema>

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'orange'> = {
  paid:             'green',
  pending_payment:  'yellow',
  draft:            'gray',
  canceled:         'red',
  overdue:          'orange',
  refunded:         'gray',
  PAID: 'green', PENDING: 'yellow', CANCELLED: 'red', OVERDUE: 'orange', REFUNDED: 'gray',
}

const statusLabels: Record<string, string> = {
  paid:             'Pago',
  pending_payment:  'Aguardando Pagamento',
  draft:            'Rascunho',
  canceled:         'Cancelado',
  overdue:          'Vencido',
  refunded:         'Reembolsado',
  PAID: 'Pago', PENDING: 'Pendente', CANCELLED: 'Cancelado', OVERDUE: 'Vencido', REFUNDED: 'Reembolsado',
}

export default function OrdersPage() {
  const router = useRouter()
  const [showNewModal, setShowNewModal] = useState(false)
  const [searchId, setSearchId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searched, setSearched] = useState(false)
  const [modalError, setModalError] = useState('')

  const { data: order, isLoading: loadingSearch, error: searchError } = useQuery<Order>({
    queryKey: ['order-search', searchId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${searchId}`)
      return data
    },
    enabled: !!searchId && searched,
    retry: false,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<OrderFormData>({
    resolver: zodResolver(orderSchema),
  })

  const createMutation = useMutation({
    mutationFn: (data: OrderFormData) => {
      const payload = {
        customerId:        data.customerId,
        productId:         data.productId,
        planId:            data.planId || undefined,
        contractedAmount:  Math.round(parseFloat(data.contractedAmount) * 100),
      }
      return api.post('/orders', payload)
    },
    onSuccess: (res) => {
      setShowNewModal(false)
      reset()
      router.push(`/orders/${res.data.id}`)
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setModalError(axiosErr?.response?.data?.message ?? 'Erro ao criar pedido')
    },
  })

  const handleSearch = () => {
    if (searchInput.trim()) {
      setSearchId(searchInput.trim())
      setSearched(true)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Pedidos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Busque e gerencie pedidos por ID</p>
        </div>
        <Button onClick={() => setShowNewModal(true)}>
          <Plus size={16} /> Novo Pedido
        </Button>
      </div>

      <Card>
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Buscar pedido por ID</label>
          <div className="flex gap-2 max-w-md">
            <input
              type="text"
              placeholder="ID do pedido (UUID)..."
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
          {loadingSearch ? (
            <Spinner />
          ) : searchError ? (
            <EmptyState icon={FileText} title="Pedido não encontrado" description="Verifique o ID informado." />
          ) : order ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Criado em</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-xs text-gray-500 font-mono">{order.id.slice(0, 8)}...</td>
                    <td className="px-6 py-3 text-sm text-gray-700">{order.customer?.name ?? order.customerId.slice(0, 8)}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{formatCurrency(order.contractedAmount)}</td>
                    <td className="px-6 py-3">
                      <Badge variant={statusColors[order.status] ?? 'gray'}>
                        {statusLabels[order.status] ?? order.status}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">{formatDateTime(order.createdAt)}</td>
                    <td className="px-6 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/orders/${order.id}`)}>
                        <Eye size={14} /> Ver
                      </Button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}
        </Card>
      )}

      {/* New Order Modal */}
      <Modal open={showNewModal} onClose={() => { setShowNewModal(false); reset(); setModalError('') }} title="Novo Pedido" size="sm">
        {modalError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{modalError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Input
            id="order-customerId"
            label="ID do Cliente (UUID)"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            error={errors.customerId?.message}
            {...register('customerId')}
          />
          <Input
            id="order-productId"
            label="ID do Produto (UUID)"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            error={errors.productId?.message}
            {...register('productId')}
          />
          <Input
            id="order-planId"
            label="ID do Plano (opcional)"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            error={errors.planId?.message}
            {...register('planId')}
          />
          <Input
            id="order-contractedAmount"
            label="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="99.90"
            error={errors.contractedAmount?.message}
            {...register('contractedAmount')}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowNewModal(false); reset(); setModalError('') }}>
              Cancelar
            </Button>
            <Button type="submit" loading={createMutation.isPending}>Criar Pedido</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
