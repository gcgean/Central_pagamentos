'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatDate, formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, PauseCircle, PlayCircle, XOctagon } from 'lucide-react'

interface License {
  id: string
  status: string
  customerId: string
  customerName?: string
  customerEmail?: string
  productId?: string
  productName?: string
  planId?: string
  planName?: string
  expiresAt?: string
  maxUsers?: number
  suspendReason?: string
  revokeReason?: string
  createdAt: string
  updatedAt?: string
  featureSet?: Record<string, unknown>
}

const reasonSchema = z.object({
  reason: z.string().min(3, 'Motivo obrigatório'),
})
type ReasonFormData = z.infer<typeof reasonSchema>

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow'> = {
  ACTIVE: 'green',
  SUSPENDED: 'yellow',
  REVOKED: 'red',
  EXPIRED: 'gray',
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  REVOKED: 'Revogada',
  EXPIRED: 'Expirada',
}

export default function LicenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [showSuspendModal, setShowSuspendModal] = useState(false)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [actionError, setActionError] = useState('')

  const { data: license, isLoading } = useQuery<License>({
    queryKey: ['license', id],
    queryFn: async () => {
      const { data } = await api.get(`/licenses/${id}`)
      return data
    },
  })

  const suspendForm = useForm<ReasonFormData>({ resolver: zodResolver(reasonSchema) })
  const revokeForm = useForm<ReasonFormData>({ resolver: zodResolver(reasonSchema) })

  const suspendMutation = useMutation({
    mutationFn: (data: ReasonFormData) => api.patch(`/licenses/${id}/suspend`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license', id] })
      setShowSuspendModal(false)
      suspendForm.reset()
    },
    onError: () => setActionError('Erro ao suspender licença'),
  })

  const reactivateMutation = useMutation({
    mutationFn: () => api.patch(`/licenses/${id}/reactivate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['license', id] }),
    onError: () => setActionError('Erro ao reativar licença'),
  })

  const revokeMutation = useMutation({
    mutationFn: (data: ReasonFormData) => api.patch(`/licenses/${id}/revoke`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['license', id] })
      setShowRevokeModal(false)
      revokeForm.reset()
    },
    onError: () => setActionError('Erro ao revogar licença'),
  })

  if (isLoading) return <Spinner />
  if (!license) return <div className="text-gray-500 text-sm">Licença não encontrada.</div>

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-gray-900">Licença</h2>
          <Badge variant={statusColors[license.status] ?? 'gray'}>
            {statusLabels[license.status] ?? license.status}
          </Badge>
        </div>
        <div className="flex gap-2">
          {license.status === 'ACTIVE' && (
            <Button variant="secondary" size="sm" onClick={() => setShowSuspendModal(true)}>
              <PauseCircle size={14} /> Suspender
            </Button>
          )}
          {license.status === 'SUSPENDED' && (
            <Button variant="secondary" size="sm" onClick={() => reactivateMutation.mutate()} loading={reactivateMutation.isPending}>
              <PlayCircle size={14} /> Reativar
            </Button>
          )}
          {!['REVOKED'].includes(license.status) && (
            <Button variant="danger" size="sm" onClick={() => setShowRevokeModal(true)}>
              <XOctagon size={14} /> Revogar
            </Button>
          )}
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Dados da Licença</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={license.id} />
            <InfoRow label="Produto" value={license.productName ?? '—'} />
            <InfoRow label="Plano" value={license.planName ?? '—'} />
            <InfoRow label="Máx. Usuários" value={license.maxUsers ? String(license.maxUsers) : '—'} />
            <InfoRow label="Expira em" value={formatDate(license.expiresAt)} />
            <InfoRow label="Criado em" value={formatDateTime(license.createdAt)} />
            {license.suspendReason && <InfoRow label="Motivo da suspensão" value={license.suspendReason} />}
            {license.revokeReason && <InfoRow label="Motivo da revogação" value={license.revokeReason} />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Cliente</h3></CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="ID" value={license.customerId} />
            {license.customerName && <InfoRow label="Nome" value={license.customerName} />}
            {license.customerEmail && <InfoRow label="E-mail" value={license.customerEmail} />}
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${license.customerId}`)}>
                Ver cliente
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      {license.featureSet && Object.keys(license.featureSet).length > 0 && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Feature Set</h3></CardHeader>
          <CardBody>
            <pre className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg overflow-x-auto">
              {JSON.stringify(license.featureSet, null, 2)}
            </pre>
          </CardBody>
        </Card>
      )}

      {/* Suspend Modal */}
      <Modal open={showSuspendModal} onClose={() => { setShowSuspendModal(false); suspendForm.reset() }} title="Suspender Licença" size="sm">
        <form onSubmit={suspendForm.handleSubmit((data) => suspendMutation.mutate(data))} className="space-y-4">
          <Input
            id="suspend-reason"
            label="Motivo da suspensão"
            placeholder="Descreva o motivo..."
            error={suspendForm.formState.errors.reason?.message}
            {...suspendForm.register('reason')}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => { setShowSuspendModal(false); suspendForm.reset() }}>Cancelar</Button>
            <Button type="submit" variant="secondary" loading={suspendMutation.isPending}>Suspender</Button>
          </div>
        </form>
      </Modal>

      {/* Revoke Modal */}
      <Modal open={showRevokeModal} onClose={() => { setShowRevokeModal(false); revokeForm.reset() }} title="Revogar Licença" size="sm">
        <p className="text-sm text-gray-600 mb-4">Esta ação é irreversível. A licença será permanentemente revogada.</p>
        <form onSubmit={revokeForm.handleSubmit((data) => revokeMutation.mutate(data))} className="space-y-4">
          <Input
            id="revoke-reason"
            label="Motivo da revogação"
            placeholder="Descreva o motivo..."
            error={revokeForm.formState.errors.reason?.message}
            {...revokeForm.register('reason')}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="outline" onClick={() => { setShowRevokeModal(false); revokeForm.reset() }}>Cancelar</Button>
            <Button type="submit" variant="danger" loading={revokeMutation.isPending}>Revogar</Button>
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
