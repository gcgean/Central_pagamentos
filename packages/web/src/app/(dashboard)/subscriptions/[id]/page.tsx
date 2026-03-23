'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, CreditCard, XCircle, RefreshCw } from 'lucide-react'
import { CheckoutResult, type CheckoutResultData } from '@/components/payments/CheckoutResult'
import { ChargesSection } from '@/components/payments/ChargesSection'

interface Subscription {
  id: string
  status: string
  customerId: string
  customerName?: string
  customerEmail?: string
  productId?: string
  productName?: string
  planId?: string
  planName?: string
  amount: number
  contractedAmount?: number
  trialDays?: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
  createdAt: string
  cancelledAt?: string
  cancelReason?: string
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

const cancelSchema = z.object({
  reason: z.string().min(3, 'Motivo obrigatório'),
  immediate: z.boolean().optional(),
})

const checkoutSchema = z.object({
  billingType: z.enum(['PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED']),
})

const changePlanSchema = z.object({
  planId: z.string().min(1, 'Selecione um plano'),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Valor inválido'),
})

type CancelFormData = z.infer<typeof cancelSchema>
type CheckoutFormData = z.infer<typeof checkoutSchema>
type ChangePlanFormData = z.infer<typeof changePlanSchema>

interface Plan { id: string; name: string; amount: number }

export default function SubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [showChangePlanModal, setShowChangePlanModal] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResultData | null>(null)
  const [actionError, setActionError] = useState('')

  const { data: sub, isLoading } = useQuery<Subscription>({
    queryKey: ['subscription', id],
    queryFn: async () => {
      const { data } = await api.get(`/subscriptions/${id}`)
      return data
    },
  })

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['plans', sub?.productId],
    queryFn: async () => {
      const { data } = await api.get(`/products/${sub!.productId}/plans`)
      return data
    },
    enabled: !!sub?.productId && showChangePlanModal,
  })

  const cancelForm = useForm<CancelFormData>({ resolver: zodResolver(cancelSchema) })
  const checkoutForm = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { billingType: 'PIX' },
  })
  const changePlanForm = useForm<ChangePlanFormData>({ resolver: zodResolver(changePlanSchema) })

  const cancelMutation = useMutation({
    mutationFn: (data: CancelFormData) => api.patch(`/subscriptions/${id}/cancel`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', id] })
      setShowCancelModal(false)
    },
    onError: () => setActionError('Erro ao cancelar assinatura'),
  })

  const checkoutMutation = useMutation({
    mutationFn: (data: CheckoutFormData) => api.post(`/subscriptions/${id}/checkout`, data),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['subscription', id] })
      queryClient.invalidateQueries({ queryKey: ['charges', 'subscription', id] })
      setShowCheckoutModal(false)
      setCheckoutResult(data)
    },
    onError: () => setActionError('Erro ao gerar cobrança'),
  })

  const changePlanMutation = useMutation({
    mutationFn: (data: ChangePlanFormData) =>
      api.patch(`/subscriptions/${id}/change-plan`, {
        planId: data.planId,
        amount: Math.round(parseFloat(data.amount) * 100),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription', id] })
      setShowChangePlanModal(false)
    },
    onError: () => setActionError('Erro ao trocar plano'),
  })

  if (isLoading) return <Spinner />
  if (!sub) return <div className="text-gray-500 text-sm">Assinatura não encontrada.</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Assinatura</h2>
          <Badge variant={statusColors[sub.status] ?? 'gray'}>
            {statusLabels[sub.status] ?? sub.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {sub.status !== 'CANCELLED' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowCheckoutModal(true)}>
                <CreditCard size={14} /> Cobrar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowChangePlanModal(true)}>
                <RefreshCw size={14} /> Trocar Plano
              </Button>
              <Button variant="danger" size="sm" onClick={() => setShowCancelModal(true)}>
                <XCircle size={14} /> Cancelar
              </Button>
            </>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <ChargesSection originType="subscription" originId={id} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Dados da Assinatura</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={sub.id} />
            <InfoRow label="Valor" value={formatCurrency(sub.amount)} />
            {sub.contractedAmount && <InfoRow label="Valor Contratado" value={formatCurrency(sub.contractedAmount)} />}
            <InfoRow label="Período" value={sub.currentPeriodStart ? `${formatDate(sub.currentPeriodStart)} — ${formatDate(sub.currentPeriodEnd)}` : '—'} />
            <InfoRow label="Criado em" value={formatDateTime(sub.createdAt)} />
            {sub.cancelledAt && <InfoRow label="Cancelado em" value={formatDateTime(sub.cancelledAt)} />}
            {sub.cancelReason && <InfoRow label="Motivo do cancelamento" value={sub.cancelReason} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Cliente & Produto</h3></CardHeader>
          <CardBody className="space-y-3">
            {sub.customerName && <InfoRow label="Cliente" value={sub.customerName} />}
            {sub.customerEmail && <InfoRow label="E-mail" value={sub.customerEmail} />}
            <InfoRow label="Produto" value={sub.productName ?? '—'} />
            <InfoRow label="Plano" value={sub.planName ?? '—'} />
            {sub.trialDays && sub.trialDays > 0 ? <InfoRow label="Trial" value={`${sub.trialDays} dias`} /> : null}
          </CardBody>
        </Card>
      </div>

      {/* Checkout Result Modal */}
      <Modal open={!!checkoutResult} onClose={() => setCheckoutResult(null)} title="Cobrança Gerada" size="sm">
        {checkoutResult && (
          <CheckoutResult result={checkoutResult} onClose={() => setCheckoutResult(null)} />
        )}
      </Modal>

      {/* Cancel Modal */}
      <Modal open={showCancelModal} onClose={() => setShowCancelModal(false)} title="Cancelar Assinatura" size="sm">
        <form onSubmit={cancelForm.handleSubmit((data) => cancelMutation.mutate(data))} className="space-y-4">
          <Input
            id="cancel-reason"
            label="Motivo do cancelamento"
            placeholder="Descreva o motivo..."
            error={cancelForm.formState.errors.reason?.message}
            {...cancelForm.register('reason')}
          />
          <div className="flex items-center gap-2">
            <input type="checkbox" id="immediate" {...cancelForm.register('immediate')} />
            <label htmlFor="immediate" className="text-sm text-gray-700">Cancelar imediatamente</label>
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setShowCancelModal(false)}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={cancelMutation.isPending}>Confirmar Cancelamento</Button>
          </div>
        </form>
      </Modal>

      {/* Checkout Modal */}
      <Modal open={showCheckoutModal} onClose={() => setShowCheckoutModal(false)} title="Gerar Cobrança" size="sm">
        <form onSubmit={checkoutForm.handleSubmit((data) => checkoutMutation.mutate(data))} className="space-y-4">
          <Select
            id="billingType"
            label="Método de Pagamento"
            options={[
              { value: 'PIX', label: 'PIX' },
              { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
              { value: 'BOLETO', label: 'Boleto' },
              { value: 'UNDEFINED', label: 'Indefinido' },
            ]}
            {...checkoutForm.register('billingType')}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setShowCheckoutModal(false)}>Cancelar</Button>
            <Button type="submit" loading={checkoutMutation.isPending}>Gerar Cobrança</Button>
          </div>
        </form>
      </Modal>

      {/* Change Plan Modal */}
      <Modal open={showChangePlanModal} onClose={() => setShowChangePlanModal(false)} title="Trocar Plano" size="sm">
        <form onSubmit={changePlanForm.handleSubmit((data) => changePlanMutation.mutate(data))} className="space-y-4">
          <Select
            id="new-planId"
            label="Novo Plano"
            placeholder="Selecione um plano"
            options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))}
            error={changePlanForm.formState.errors.planId?.message}
            {...changePlanForm.register('planId')}
          />
          <Input
            id="new-amount"
            label="Novo Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="99.90"
            error={changePlanForm.formState.errors.amount?.message}
            {...changePlanForm.register('amount')}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => setShowChangePlanModal(false)}>Cancelar</Button>
            <Button type="submit" loading={changePlanMutation.isPending}>Confirmar Troca</Button>
          </div>
        </form>
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
