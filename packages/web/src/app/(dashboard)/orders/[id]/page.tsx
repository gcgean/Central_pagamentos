'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, CreditCard, XCircle } from 'lucide-react'
import { CheckoutResult, type CheckoutResultData } from '@/components/payments/CheckoutResult'
import { ChargesSection } from '@/components/payments/ChargesSection'

interface Order {
  id: string
  status: string
  customerId: string
  customerName?: string
  customerEmail?: string
  totalAmount: number
  description?: string
  createdAt: string
  paidAt?: string
  cancelledAt?: string
  items?: { id: string; description: string; quantity: number; unitPrice: number; total: number }[]
}

const checkoutSchema = z.object({
  billingType: z.enum(['PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED']),
})

type CheckoutFormData = z.infer<typeof checkoutSchema>

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'orange'> = {
  PAID: 'green',
  PENDING: 'yellow',
  CANCELLED: 'red',
  OVERDUE: 'orange',
  REFUNDED: 'gray',
}

const statusLabels: Record<string, string> = {
  PAID: 'Pago',
  PENDING: 'Pendente',
  CANCELLED: 'Cancelado',
  OVERDUE: 'Vencido',
  REFUNDED: 'Reembolsado',
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResultData | null>(null)
  const [actionError, setActionError] = useState('')

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${id}`)
      return data
    },
  })

  const { register, handleSubmit, formState: { errors } } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { billingType: 'PIX' },
  })

  const checkoutMutation = useMutation({
    mutationFn: (data: CheckoutFormData) => api.post(`/orders/${id}/checkout`, data),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['charges', 'order', id] })
      setShowCheckoutModal(false)
      setCheckoutResult(data)
    },
    onError: () => setActionError('Erro ao gerar cobrança'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/orders/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      setShowCancelConfirm(false)
    },
    onError: () => setActionError('Erro ao cancelar pedido'),
  })

  if (isLoading) return <Spinner />
  if (!order) return <div className="text-gray-500 text-sm">Pedido não encontrado.</div>

  const canCheckout = ['PENDING'].includes(order.status)
  const canCancel = !['CANCELLED', 'REFUNDED'].includes(order.status)

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Pedido</h2>
          <Badge variant={statusColors[order.status] ?? 'gray'}>
            {statusLabels[order.status] ?? order.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {canCheckout && (
            <Button variant="outline" size="sm" onClick={() => setShowCheckoutModal(true)}>
              <CreditCard size={14} /> Cobrar
            </Button>
          )}
          {canCancel && (
            <Button variant="danger" size="sm" onClick={() => setShowCancelConfirm(true)}>
              <XCircle size={14} /> Cancelar
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <ChargesSection originType="order" originId={id} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Informações do Pedido</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={order.id} />
            <InfoRow label="Valor Total" value={formatCurrency(order.totalAmount)} />
            {order.description && <InfoRow label="Descrição" value={order.description} />}
            <InfoRow label="Criado em" value={formatDateTime(order.createdAt)} />
            {order.paidAt && <InfoRow label="Pago em" value={formatDateTime(order.paidAt)} />}
            {order.cancelledAt && <InfoRow label="Cancelado em" value={formatDateTime(order.cancelledAt)} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Cliente</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={order.customerId} />
            {order.customerName && <InfoRow label="Nome" value={order.customerName} />}
            {order.customerEmail && <InfoRow label="E-mail" value={order.customerEmail} />}
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/customers/${order.customerId}`)}
              >
                Ver cliente
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {order.items && order.items.length > 0 && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Itens do Pedido</h3></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Qtd</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Unitário</th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-sm text-gray-900">{item.description}</td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right">{item.quantity}</td>
                    <td className="px-6 py-3 text-sm text-gray-600 text-right">{formatCurrency(item.unitPrice)}</td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Checkout Result Modal */}
      <Modal open={!!checkoutResult} onClose={() => setCheckoutResult(null)} title="Cobrança Gerada" size="sm">
        {checkoutResult && (
          <CheckoutResult result={checkoutResult} onClose={() => setCheckoutResult(null)} />
        )}
      </Modal>

      {/* Checkout Modal */}
      <Modal open={showCheckoutModal} onClose={() => setShowCheckoutModal(false)} title="Gerar Cobrança" size="sm">
        <form onSubmit={handleSubmit((data) => checkoutMutation.mutate(data))} className="space-y-4">
          <Select
            id="order-billingType"
            label="Método de Pagamento"
            options={[
              { value: 'PIX', label: 'PIX' },
              { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
              { value: 'BOLETO', label: 'Boleto' },
              { value: 'UNDEFINED', label: 'Indefinido' },
            ]}
            {...register('billingType')}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setShowCheckoutModal(false)}>Cancelar</Button>
            <Button type="submit" loading={checkoutMutation.isPending}>Gerar Cobrança</Button>
          </div>
        </form>
      </Modal>

      {/* Cancel Confirm Modal */}
      <Modal open={showCancelConfirm} onClose={() => setShowCancelConfirm(false)} title="Cancelar Pedido" size="sm">
        <p className="text-sm text-gray-600 mb-6">Tem certeza que deseja cancelar este pedido? Esta ação não pode ser desfeita.</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setShowCancelConfirm(false)}>Voltar</Button>
          <Button variant="danger" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
            Confirmar Cancelamento
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right break-all">{value}</span>
    </div>
  )
}
