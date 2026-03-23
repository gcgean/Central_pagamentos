'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import { api } from '@/lib/api'
import { formatDate, formatDateTime, formatDocument, formatCurrency } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ArrowLeft, ShieldCheck, Zap, UserCheck, UserX, Edit } from 'lucide-react'

interface Customer {
  id: string
  personType: 'PF' | 'PJ'
  legalName: string
  tradeName?: string
  document: string
  documentClean?: string
  email: string
  phone?: string
  status: string
  addressZip?: string
  addressStreet?: string
  addressNumber?: string
  addressComp?: string
  addressDistrict?: string
  addressCity?: string
  addressState?: string
  notes?: string
  createdAt: string
  updatedAt?: string
}

interface Subscription {
  id: string
  status: string
  product?: { name: string; code: string }
  plan?: { name: string; amount: number }
  contractedAmount?: number
  currentPeriodStart?: string
  currentPeriodEnd?: string
}

interface License {
  id: string
  status: string
  productName: string
  planName: string
  expiresAt?: string
  maxUsers?: number
}

const statusColors: Record<string, 'green' | 'gray' | 'red' | 'yellow'> = {
  // customer statuses (lowercase from DB)
  active: 'green', inactive: 'gray', blocked: 'red', suspended: 'yellow',
  // subscription statuses
  pending: 'yellow', canceled: 'red', trialing: 'green', overdue: 'yellow',
  // uppercase legacy
  ACTIVE: 'green', INACTIVE: 'gray', BLOCKED: 'red', SUSPENDED: 'yellow',
  CANCELLED: 'red', PENDING: 'yellow',
}

const statusLabels: Record<string, string> = {
  active: 'Ativo', inactive: 'Inativo', blocked: 'Bloqueado', suspended: 'Suspenso',
  pending: 'Pendente', canceled: 'Cancelado', trialing: 'Trial', overdue: 'Vencido',
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', BLOCKED: 'Bloqueado', SUSPENDED: 'Suspenso',
  CANCELLED: 'Cancelado', PENDING: 'Pendente',
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'licenses'>('subscriptions')
  const [actionError, setActionError] = useState('')

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ['customer', id],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${id}`)
      return data
    },
  })

  const { data: subscriptions, isLoading: loadingSubscriptions } = useQuery<Subscription[]>({
    queryKey: ['customer-subscriptions', id],
    queryFn: async () => {
      const { data } = await api.get(`/subscriptions/customer/${id}`)
      return data
    },
    enabled: activeTab === 'subscriptions',
  })

  const { data: licenses, isLoading: loadingLicenses } = useQuery<License[]>({
    queryKey: ['customer-licenses', id],
    queryFn: async () => {
      const { data } = await api.get(`/customers/${id}/licenses`)
      return data
    },
    enabled: activeTab === 'licenses',
  })

  const activateMutation = useMutation({
    mutationFn: () => api.patch(`/customers/${id}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer', id] }),
    onError: () => setActionError('Erro ao ativar cliente'),
  })

  const blockMutation = useMutation({
    mutationFn: () => api.patch(`/customers/${id}/block`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customer', id] }),
    onError: () => setActionError('Erro ao bloquear cliente'),
  })

  if (isLoading) return <Spinner />
  if (!customer) return <div className="text-gray-500 text-sm">Cliente não encontrado.</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">{customer.legalName}</h2>
            <Badge variant={statusColors[customer.status] ?? 'gray'}>
              {statusLabels[customer.status] ?? customer.status}
            </Badge>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {customer.personType === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'} &bull;{' '}
            {customer.document ? formatDocument(customer.document) : '—'}
          </p>
        </div>
        <div className="flex gap-2">
          {customer.status !== 'active' && customer.status !== 'ACTIVE' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => activateMutation.mutate()}
              loading={activateMutation.isPending}
            >
              <UserCheck size={14} /> Ativar
            </Button>
          )}
          {(customer.status === 'active' || customer.status === 'ACTIVE') && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => blockMutation.mutate()}
              loading={blockMutation.isPending}
            >
              <UserX size={14} /> Bloquear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => router.push(`/customers/${id}/edit`)}>
            <Edit size={14} /> Editar
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{actionError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Info */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Dados Pessoais</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <InfoRow label="Nome" value={customer.legalName} />
            {customer.tradeName && <InfoRow label="Nome Fantasia" value={customer.tradeName} />}
            <InfoRow label="Documento" value={customer.document ? formatDocument(customer.document) : '—'} />
            <InfoRow label="E-mail" value={customer.email} />
            <InfoRow label="Telefone" value={customer.phone ?? '—'} />
            <InfoRow label="Cadastrado em" value={formatDateTime(customer.createdAt)} />
          </CardBody>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Endereço</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {customer.addressStreet || customer.addressCity ? (
              <>
                {customer.addressZip && <InfoRow label="CEP" value={customer.addressZip} />}
                <InfoRow label="Logradouro" value={`${customer.addressStreet ?? '—'}, ${customer.addressNumber ?? '—'}`} />
                {customer.addressComp && <InfoRow label="Complemento" value={customer.addressComp} />}
                {customer.addressDistrict && <InfoRow label="Bairro" value={customer.addressDistrict} />}
                <InfoRow label="Cidade" value={`${customer.addressCity ?? '—'} - ${customer.addressState ?? '—'}`} />
              </>
            ) : (
              <p className="text-sm text-gray-400">Endereço não informado</p>
            )}
          </CardBody>
        </Card>
      </div>

      {customer.notes && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold text-gray-900">Observações</h3></CardHeader>
          <CardBody><p className="text-sm text-gray-700">{customer.notes}</p></CardBody>
        </Card>
      )}

      {/* Tabs */}
      <div>
        <div className="flex border-b border-gray-200 mb-4">
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'subscriptions'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2"><Zap size={14} /> Assinaturas</span>
          </button>
          <button
            onClick={() => setActiveTab('licenses')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'licenses'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center gap-2"><ShieldCheck size={14} /> Licenças</span>
          </button>
        </div>

        <Card>
          {activeTab === 'subscriptions' && (
            loadingSubscriptions ? <Spinner /> :
            !subscriptions?.length ? (
              <EmptyState icon={Zap} title="Nenhuma assinatura" description="Este cliente não possui assinaturas." />
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
                        <td className="px-6 py-3 text-sm text-gray-600">{formatCurrency(sub.contractedAmount ?? sub.plan?.amount ?? 0)}</td>
                        <td className="px-6 py-3">
                          <Badge variant={statusColors[sub.status] ?? 'gray'}>
                            {statusLabels[sub.status] ?? sub.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">
                          {sub.currentPeriodStart ? `${formatDate(sub.currentPeriodStart)} — ${formatDate(sub.currentPeriodEnd)}` : '—'}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/subscriptions/${sub.id}`)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === 'licenses' && (
            loadingLicenses ? <Spinner /> :
            !licenses?.length ? (
              <EmptyState icon={ShieldCheck} title="Nenhuma licença" description="Este cliente não possui licenças." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Produto</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plano</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Expira em</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Usuários</th>
                      <th className="px-6 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {licenses.map((lic) => (
                      <tr key={lic.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{lic.productName}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{lic.planName}</td>
                        <td className="px-6 py-3">
                          <Badge variant={statusColors[lic.status] ?? 'gray'}>
                            {statusLabels[lic.status] ?? lic.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 text-sm text-gray-500">{formatDate(lic.expiresAt)}</td>
                        <td className="px-6 py-3 text-sm text-gray-500">{lic.maxUsers ?? '—'}</td>
                        <td className="px-6 py-3 text-right">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/licenses/${lic.id}`)}>
                            Ver
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Card>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  )
}
