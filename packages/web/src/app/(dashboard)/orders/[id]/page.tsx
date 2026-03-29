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
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, CreditCard, XCircle } from 'lucide-react'
import { CheckoutResult, type CheckoutResultData } from '@/components/payments/CheckoutResult'
import { ChargesSection } from '@/components/payments/ChargesSection'
import { tokenizeCreditCard } from '@/lib/mercadopago'

interface Order {
  id: string
  status: string
  customerId: string
  customer?: { name: string; email: string }
  product?: { name: string; code: string }
  plan?: { name: string } | null
  contractedAmount: number
  contractedCurrency?: string
  description?: string
  createdAt: string
  paidAt?: string
  canceledAt?: string
  items?: { id: string; description: string; quantity: number; unitPrice: number; total: number }[]
}

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

type CheckoutFormData = z.infer<typeof checkoutSchema>
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

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow' | 'orange'> = {
  paid:             'green',
  pending_payment:  'yellow',
  draft:            'gray',
  canceled:         'red',
  overdue:          'orange',
  refunded:         'gray',
  // legacy uppercase
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResultData | null>(null)
  const [actionError, setActionError] = useState('')
  const [cardFieldErrors, setCardFieldErrors] = useState<CardFieldErrors>({})

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${id}`)
      return data
    },
  })

  const { register, handleSubmit, watch } = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { billingType: 'PIX' },
  })
  const selectedBillingType = watch('billingType')

  const checkoutMutation = useMutation({
    mutationFn: (data: CheckoutFormData) => api.post(`/orders/${id}/checkout`, data),
    onSuccess: ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['charges', 'order', id] })
      setShowCheckoutModal(false)
      setCheckoutResult(data)
    },
    onError: (err: any) => setActionError(err?.response?.data?.message ?? 'Erro ao gerar cobrança'),
  })

  const submitCheckout = handleSubmit(async (data) => {
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
          issuerId: tokenized.issuerId
        },
      } as any)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Falha ao tokenizar cartão.'
      setCardFieldErrors(mapTokenizationErrorToField(msg))
      setActionError(msg)
    }
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

  const canCheckout = ['PENDING', 'pending_payment', 'pending'].includes(order.status)
  const canCancel = !['CANCELLED', 'REFUNDED', 'canceled', 'refunded'].includes(order.status)

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
            <InfoRow label="Valor Total" value={formatCurrency(order.contractedAmount)} />
            {order.description && <InfoRow label="Descrição" value={order.description} />}
            {order.product?.name && <InfoRow label="Produto" value={order.product.name} />}
            {order.plan?.name && <InfoRow label="Plano" value={order.plan.name} />}
            <InfoRow label="Criado em" value={formatDateTime(order.createdAt)} />
            {order.paidAt && <InfoRow label="Pago em" value={formatDateTime(order.paidAt)} />}
            {order.canceledAt && <InfoRow label="Cancelado em" value={formatDateTime(order.canceledAt)} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Cliente</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={order.customerId} />
            {order.customer?.name && <InfoRow label="Nome" value={order.customer.name} />}
            {order.customer?.email && <InfoRow label="E-mail" value={order.customer.email} />}
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
        <form onSubmit={submitCheckout} className="space-y-4">
          {actionError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{actionError}</p>
            </div>
          )}
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
          {selectedBillingType === 'CREDIT_CARD' && (
            <div className="space-y-3 border border-gray-200 rounded-lg p-3">
              <Input id="order-cardNumber" label="Número do cartão" placeholder="5031 4332 1540 6351" error={cardFieldErrors.cardNumber} {...register('cardNumber')} />
              <Input id="order-cardholderName" label="Nome no cartão" placeholder="APRO" error={cardFieldErrors.cardholderName} {...register('cardholderName')} />
              <div className="grid grid-cols-3 gap-3">
                <Input id="order-cardExpirationMonth" label="Mês" placeholder="11" error={cardFieldErrors.cardExpirationMonth} {...register('cardExpirationMonth')} />
                <Input id="order-cardExpirationYear" label="Ano" placeholder="2030" error={cardFieldErrors.cardExpirationYear} {...register('cardExpirationYear')} />
                <Input id="order-securityCode" label="CVV" placeholder="123" error={cardFieldErrors.securityCode} {...register('securityCode')} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Select
                  id="order-identificationType"
                  label="Tipo documento"
                  options={[{ value: 'CPF', label: 'CPF' }, { value: 'CNPJ', label: 'CNPJ' }]}
                  error={cardFieldErrors.identificationType}
                  {...register('identificationType')}
                />
                <Input id="order-identificationNumber" label="Documento" placeholder="99999999999" error={cardFieldErrors.identificationNumber} {...register('identificationNumber')} />
                <Input id="order-installmentCount" label="Parcelas" type="number" min="1" step="1" placeholder="1" error={cardFieldErrors.installmentCount} {...register('installmentCount')} />
              </div>
            </div>
          )}
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
