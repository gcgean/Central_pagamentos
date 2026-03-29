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
import { tokenizeCreditCard } from '@/lib/mercadopago'

interface Subscription {
  id: string
  status: string
  customerId: string
  customer?: { name: string; email: string }
  productId?: string
  product?: { name: string; code: string }
  planId?: string
  plan?: { name: string; amount: number; intervalUnit: string; intervalCount: number }
  contractedAmount?: number
  trialDays?: number
  trialEndsAt?: string
  currentPeriodStart?: string
  currentPeriodEnd?: string
  createdAt: string
  canceledAt?: string
  cancellationReason?: string
}

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'blue' | 'orange'> = {
  active:    'green',
  inactive:  'gray',
  canceled:  'red',
  pending:   'yellow',
  trialing:  'blue',
  overdue:   'orange',
  // legacy uppercase keys
  ACTIVE: 'green', INACTIVE: 'gray', CANCELLED: 'red', PENDING: 'yellow', TRIALING: 'blue', OVERDUE: 'orange',
}

const statusLabels: Record<string, string> = {
  active:    'Ativo',
  inactive:  'Inativo',
  canceled:  'Cancelado',
  pending:   'Pendente',
  trialing:  'Trial',
  overdue:   'Vencido',
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', CANCELLED: 'Cancelado', PENDING: 'Pendente', TRIALING: 'Trial', OVERDUE: 'Vencido',
}

const cancelSchema = z.object({
  reason: z.string().min(3, 'Motivo obrigatório'),
  immediate: z.boolean().optional(),
})

const checkoutSchema = z.object({
  billingType: z.enum(['PIX', 'CREDIT_CARD', 'BOLETO', 'UNDEFINED']),
  installmentCount: z.string().optional(),
  cardNumber: z.string().optional(),
  cardholderName: z.string().optional(),
  cardExpirationMonth: z.string().optional(),
  cardExpirationYear: z.string().optional(),
  securityCode: z.string().optional(),
  identificationType: z.enum(['CPF', 'CNPJ']).optional(),
  identificationNumber: z.string().optional(),
})

const changePlanSchema = z.object({
  planId: z.string().min(1, 'Selecione um plano'),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Valor inválido'),
})

type CancelFormData = z.infer<typeof cancelSchema>
type CheckoutFormData = z.infer<typeof checkoutSchema>
type ChangePlanFormData = z.infer<typeof changePlanSchema>
type CardFieldErrors = Partial<Record<'cardNumber' | 'cardholderName' | 'cardExpirationMonth' | 'cardExpirationYear' | 'securityCode' | 'identificationType' | 'identificationNumber' | 'installmentCount', string>>

function validateCardFields(data: CheckoutFormData): CardFieldErrors {
  const errors: CardFieldErrors = {}
  const cardNumber = (data.cardNumber ?? '').replace(/\D/g, '')
  const cardholderName = (data.cardholderName ?? '').trim()
  const month = Number((data.cardExpirationMonth ?? '').trim())
  const yearRaw = (data.cardExpirationYear ?? '').trim()
  const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw)
  const cvv = (data.securityCode ?? '').replace(/\D/g, '')
  const docType = (data.identificationType ?? 'CPF') as 'CPF' | 'CNPJ'
  const doc = (data.identificationNumber ?? '').replace(/\D/g, '')
  const installments = Number((data.installmentCount ?? '1').trim())

  if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) errors.cardNumber = 'Número do cartão inválido.'
  if (!cardholderName || cardholderName.length < 3) errors.cardholderName = 'Nome no cartão inválido.'
  if (!Number.isInteger(month) || month < 1 || month > 12) errors.cardExpirationMonth = 'Mês inválido.'
  if (!Number.isInteger(year) || year < 2024 || year > 2099) errors.cardExpirationYear = 'Ano inválido.'
  if (!cvv || cvv.length < 3 || cvv.length > 4) errors.securityCode = 'CVV inválido.'
  if (docType === 'CPF' && doc.length !== 11) errors.identificationNumber = 'CPF inválido.'
  if (docType === 'CNPJ' && doc.length !== 14) errors.identificationNumber = 'CNPJ inválido.'
  if (!Number.isInteger(installments) || installments < 1 || installments > 12) errors.installmentCount = 'Parcelas devem ser entre 1 e 12.'

  return errors
}

function mapTokenizationErrorToField(message: string): CardFieldErrors {
  const msg = message.toLowerCase()
  if (msg.includes('número do cartão') || msg.includes('card number') || msg.includes('number')) return { cardNumber: message }
  if (msg.includes('nome no cartão') || msg.includes('cardholder') || msg.includes('name')) return { cardholderName: message }
  if (msg.includes('cvv') || msg.includes('security code') || msg.includes('código de segurança')) return { securityCode: message }
  if (msg.includes('mês') || msg.includes('month')) return { cardExpirationMonth: message }
  if (msg.includes('ano') || msg.includes('year') || msg.includes('expiration')) return { cardExpirationYear: message }
  if (msg.includes('cpf') || msg.includes('cnpj') || msg.includes('document') || msg.includes('identification')) return { identificationNumber: message }
  return {}
}

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
  const [cardFieldErrors, setCardFieldErrors] = useState<CardFieldErrors>({})

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
    onError: (err: any) => setActionError(err?.response?.data?.message ?? 'Erro ao gerar cobrança'),
  })

  const submitCheckout = checkoutForm.handleSubmit(async (data) => {
    setActionError('')
    setCardFieldErrors({})
    if (data.billingType !== 'CREDIT_CARD') {
      checkoutMutation.mutate(data)
      return
    }
    const validationErrors = validateCardFields(data)
    if (Object.keys(validationErrors).length > 0) {
      setCardFieldErrors(validationErrors)
      setActionError('Corrija os campos destacados do cartão.')
      return
    }
    try {
      const { data: keyRes } = await api.get('/settings/gateway/mercadopago/public-key')
      const publicKey: string = keyRes?.publicKey
      if (!publicKey) throw new Error('Public Key do Mercado Pago não configurada.')
      const tokenized = await tokenizeCreditCard(publicKey, {
        cardNumber: data.cardNumber ?? '',
        cardholderName: data.cardholderName ?? '',
        cardExpirationMonth: data.cardExpirationMonth ?? '',
        cardExpirationYear: data.cardExpirationYear ?? '',
        securityCode: data.securityCode ?? '',
        identificationType: data.identificationType ?? 'CPF',
        identificationNumber: data.identificationNumber ?? '',
      })
      checkoutMutation.mutate({
        billingType: 'CREDIT_CARD',
        installmentCount: data.installmentCount,
        creditCard: {
          token: tokenized.token,
          paymentMethodId: tokenized.paymentMethodId,
          issuerId: tokenized.issuerId, // Include issuerId for MercadoPago
        },
      } as any)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Falha ao tokenizar cartão.'
      setCardFieldErrors(mapTokenizationErrorToField(msg))
      setActionError(msg)
    }
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
            <InfoRow label="Valor Contratado" value={formatCurrency(sub.contractedAmount ?? 0)} />
            {sub.plan?.amount != null && <InfoRow label="Valor do Plano" value={formatCurrency(sub.plan.amount)} />}
            <InfoRow label="Período" value={sub.currentPeriodStart ? `${formatDate(sub.currentPeriodStart)} — ${formatDate(sub.currentPeriodEnd ?? '')}` : '—'} />
            <InfoRow label="Criado em" value={formatDateTime(sub.createdAt)} />
            {sub.canceledAt && <InfoRow label="Cancelado em" value={formatDateTime(sub.canceledAt)} />}
            {sub.cancellationReason && <InfoRow label="Motivo do cancelamento" value={sub.cancellationReason} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Cliente & Produto</h3></CardHeader>
          <CardBody className="space-y-3">
            {sub.customer?.name && <InfoRow label="Cliente" value={sub.customer.name} />}
            {sub.customer?.email && <InfoRow label="E-mail" value={sub.customer.email} />}
            <InfoRow label="Produto" value={sub.product?.name ?? '—'} />
            <InfoRow label="Plano" value={sub.plan?.name ?? '—'} />
            {sub.trialEndsAt && <InfoRow label="Trial até" value={formatDate(sub.trialEndsAt)} />}
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
        <form onSubmit={submitCheckout} className="space-y-4">
          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{actionError}</p>
            </div>
          )}
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
          {checkoutForm.watch('billingType') === 'CREDIT_CARD' && (
            <div className="space-y-3 border border-gray-200 rounded-lg p-3">
              <Input id="cardNumber" label="Número do cartão" placeholder="5031 4332 1540 6351" error={cardFieldErrors.cardNumber} {...checkoutForm.register('cardNumber')} />
              <Input id="cardholderName" label="Nome no cartão" placeholder="APRO" error={cardFieldErrors.cardholderName} {...checkoutForm.register('cardholderName')} />
              <div className="grid grid-cols-3 gap-3">
                <Input id="cardExpirationMonth" label="Mês" placeholder="11" error={cardFieldErrors.cardExpirationMonth} {...checkoutForm.register('cardExpirationMonth')} />
                <Input id="cardExpirationYear" label="Ano" placeholder="2030" error={cardFieldErrors.cardExpirationYear} {...checkoutForm.register('cardExpirationYear')} />
                <Input id="securityCode" label="CVV" placeholder="123" error={cardFieldErrors.securityCode} {...checkoutForm.register('securityCode')} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select
                  id="identificationType"
                  label="Tipo documento"
                  options={[{ value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' }]}
                  error={cardFieldErrors.identificationType}
                  {...checkoutForm.register('identificationType')}
                />
                <Input id="identificationNumber" label="Documento" placeholder="99999999999" error={cardFieldErrors.identificationNumber} {...checkoutForm.register('identificationNumber')} />
                <Input id="installmentCount" label="Parcelas" type="number" min="1" step="1" placeholder="1" error={cardFieldErrors.installmentCount} {...checkoutForm.register('installmentCount')} />
              </div>
            </div>
          )}
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
