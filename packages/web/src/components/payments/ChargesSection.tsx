'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { RotateCcw, XCircle, ExternalLink, Copy, Check, RefreshCw } from 'lucide-react'
import type { BadgeVariant } from './types'

interface Charge {
  id: string
  external_charge_id: string
  amount: number
  currency: string
  payment_method: string
  status: string
  gateway_name: string
  checkout_url: string | null
  pix_qr_code: string | null
  pix_expires_at: string | null
  boleto_url: string | null
  installment_count: number
  attempt_number: number
  paid_at: string | null
  failed_reason?: string | null
  created_at: string
}

const statusVariant: Record<string, BadgeVariant> = {
  pending:  'yellow',
  paid:     'green',
  failed:   'red',
  canceled: 'gray',
  refunded: 'purple',
}

const statusLabel: Record<string, string> = {
  pending:  'Pendente',
  paid:     'Pago',
  failed:   'Falhou',
  canceled: 'Cancelado',
  refunded: 'Reembolsado',
}

const methodLabel: Record<string, string> = {
  pix:         'PIX',
  credit_card: 'Cartão',
}

const failedReasonFriendly: Record<string, string> = {
  cc_rejected_insufficient_amount: 'Limite insuficiente',
  cc_rejected_bad_filled_security_code: 'CVV inválido',
  cc_rejected_bad_filled_date: 'Validade inválida',
  cc_rejected_call_for_authorize: 'Banco emissor negou, contate o banco',
  cc_rejected_high_risk: 'Pagamento recusado por política de risco',
  cc_rejected_other_reason: 'Pagamento recusado pelo emissor',
}

function getFailedReasonMessage(reason?: string | null) {
  if (!reason) return 'Pagamento recusado'
  const normalized = reason.trim()
  return failedReasonFriendly[normalized] ?? normalized
}

interface Props {
  originType: 'subscription' | 'order'
  originId: string
}

export function ChargesSection({ originType, originId }: Props) {
  const queryClient = useQueryClient()
  const [refundTarget, setRefundTarget] = useState<Charge | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Charge | null>(null)
  const [partialAmount, setPartialAmount] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const { data: charges, isLoading } = useQuery<Charge[]>({
    queryKey: ['charges', originType, originId],
    queryFn: async () => {
      const { data } = await api.get('/payments/charges', {
        params: { originType, originId },
      })
      return data
    },
  })

  const refundMutation = useMutation({
    mutationFn: ({ externalId, value }: { externalId: string; value?: number }) =>
      api.post(`/payments/charges/${externalId}/refund`, value ? { value } : {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges', originType, originId] })
      setRefundTarget(null)
      setPartialAmount('')
      setActionError('')
    },
    onError: () => setActionError('Erro ao solicitar estorno. Verifique o status da cobrança.'),
  })

  const cancelMutation = useMutation({
    mutationFn: (externalId: string) =>
      api.post(`/payments/charges/${externalId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['charges', originType, originId] })
      setCancelTarget(null)
      setActionError('')
    },
    onError: () => setActionError('Erro ao cancelar cobrança.'),
  })

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  const handleRefund = () => {
    if (!refundTarget) return
    const cents = partialAmount
      ? Math.round(parseFloat(partialAmount) * 100)
      : undefined
    refundMutation.mutate({ externalId: refundTarget.external_charge_id, value: cents })
  }

  if (isLoading) return <Spinner className="py-6" />

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Cobranças</h3>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['charges', originType, originId] })}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </CardHeader>

      {!charges || charges.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-gray-500">
          Nenhuma cobrança gerada ainda.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {charges.map((charge) => (
            <div key={charge.id} className="px-6 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={statusVariant[charge.status] ?? 'gray'}>
                    {statusLabel[charge.status] ?? charge.status}
                  </Badge>
                  <span className="text-sm font-medium text-gray-900">
                    {formatCurrency(charge.amount)}
                  </span>
                  <span className="text-xs text-gray-500">
                    {methodLabel[charge.payment_method] ?? charge.payment_method}
                    {charge.installment_count > 1 && ` · ${charge.installment_count}x`}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{formatDateTime(charge.created_at)}</span>
              </div>

              {/* Links de pagamento */}
              <div className="flex flex-wrap gap-2">
                {charge.checkout_url && (
                  <a
                    href={charge.checkout_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink size={12} /> Link de pagamento
                  </a>
                )}
                {charge.boleto_url && (
                  <a
                    href={charge.boleto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                  >
                    <ExternalLink size={12} /> Boleto
                  </a>
                )}
                {charge.pix_qr_code && (
                  <button
                    onClick={() => copy(charge.pix_qr_code!, `pix-${charge.id}`)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                  >
                    {copied === `pix-${charge.id}`
                      ? <><Check size={12} /> Copiado!</>
                      : <><Copy size={12} /> Copiar código PIX</>
                    }
                  </button>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-2">
                {charge.status === 'paid' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setRefundTarget(charge); setPartialAmount(''); setActionError('') }}
                  >
                    <RotateCcw size={12} /> Estornar
                  </Button>
                )}
                {charge.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCancelTarget(charge); setActionError('') }}
                  >
                    <XCircle size={12} /> Cancelar cobrança
                  </Button>
                )}
                <span className="text-xs text-gray-400 self-center ml-1">
                  #{charge.attempt_number} · {charge.gateway_name}
                </span>
              </div>
              {charge.status === 'failed' && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-md px-2 py-1 inline-block">
                  Motivo: {getFailedReasonMessage(charge.failed_reason)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Refund Modal */}
      <Modal
        open={!!refundTarget}
        onClose={() => setRefundTarget(null)}
        title="Estornar Cobrança"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Valor total da cobrança:{' '}
            <strong>{refundTarget ? formatCurrency(refundTarget.amount) : ''}</strong>
          </p>
          <Input
            id="partial-refund"
            label="Valor do estorno (R$) — deixe em branco para estorno total"
            type="number"
            step="0.01"
            min="0.01"
            placeholder={refundTarget ? (refundTarget.amount / 100).toFixed(2) : ''}
            value={partialAmount}
            onChange={(e) => setPartialAmount(e.target.value)}
          />
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancelar</Button>
            <Button
              variant="danger"
              loading={refundMutation.isPending}
              onClick={handleRefund}
            >
              <RotateCcw size={14} /> Confirmar Estorno
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel Charge Modal */}
      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar Cobrança"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Tem certeza que deseja cancelar esta cobrança de{' '}
            <strong>{cancelTarget ? formatCurrency(cancelTarget.amount) : ''}</strong>?
          </p>
          {actionError && <p className="text-xs text-red-600">{actionError}</p>}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>Voltar</Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.external_charge_id)}
            >
              <XCircle size={14} /> Cancelar Cobrança
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}
