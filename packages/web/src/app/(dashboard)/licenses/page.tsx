'use client'
import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Search, Plus, Eye, ShieldCheck } from 'lucide-react'

interface License {
  id: string
  status: string
  customerId: string
  customerName?: string
  productName?: string
  planName?: string
  product?: { name?: string; code?: string }
  plan?: { name?: string; code?: string }
  expiresAt?: string
  maxUsers?: number
  createdAt: string
}

const manualSchema = z.object({
  customerId: z.string().uuid('ID de cliente inválido'),
  planId: z.string().min(1, 'ID do plano obrigatório'),
  expiresAt: z.string().optional(),
  maxUsers: z.coerce.number().int().min(1).optional(),
})

type ManualFormData = z.infer<typeof manualSchema>

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

export default function LicensesPage() {
  const router = useRouter()
  const [customerId, setCustomerId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [searched, setSearched] = useState(false)
  const [showManualModal, setShowManualModal] = useState(false)
  const [manualError, setManualError] = useState('')

  const { data: licenses, isLoading } = useQuery<License[]>({
    queryKey: ['licenses', 'customer', customerId],
    queryFn: async () => {
      const { data } = customerId
        ? await api.get(`/licenses/customer/${customerId}`)
        : await api.get('/licenses')
      return data
    },
    enabled: searched,
  })

  const syncPendingMutation = useMutation({
    mutationFn: () => api.post('/payments/sync-pending'),
    retry: false,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
  })

  const createManualMutation = useMutation({
    mutationFn: (data: ManualFormData) => api.post('/licenses/manual', data),
    onSuccess: (res) => {
      setShowManualModal(false)
      reset()
      router.push(`/licenses/${res.data.id}`)
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setManualError(axiosErr?.response?.data?.message ?? 'Erro ao criar licença')
    },
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
          <h2 className="text-xl font-semibold text-gray-900">Licenças</h2>
          <p className="text-sm text-gray-500 mt-0.5">Busque e gerencie licenças por cliente</p>
        </div>
        <Button onClick={() => setShowManualModal(true)}>
          <Plus size={16} /> Licença Manual
        </Button>
      </div>

      <Card>
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Buscar licenças de um cliente</label>
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
          ) : !licenses?.length ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhuma licença encontrada"
              description={customerId ? 'Este cliente não possui licenças.' : 'Não há licenças cadastradas.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Produto</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Plano</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Expira em</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Máx. Usuários</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {licenses.map((lic) => (
                    <tr key={lic.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{lic.productName ?? lic.product?.name ?? '—'}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{lic.planName ?? lic.plan?.name ?? '—'}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusColors[lic.status] ?? 'gray'}>
                          {statusLabels[lic.status] ?? lic.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{formatDate(lic.expiresAt)}</td>
                      <td className="px-6 py-3 text-sm text-gray-500">{lic.maxUsers ?? '—'}</td>
                      <td className="px-6 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => router.push(`/licenses/${lic.id}`)}>
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

      {/* Manual License Modal */}
      <Modal open={showManualModal} onClose={() => { setShowManualModal(false); reset(); setManualError('') }} title="Criar Licença Manual" size="sm">
        {manualError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{manualError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit((data) => createManualMutation.mutate(data))} className="space-y-4">
          <Input
            id="lic-customerId"
            label="ID do Cliente (UUID)"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            error={errors.customerId?.message}
            {...register('customerId')}
          />
          <Input
            id="lic-planId"
            label="ID do Plano (UUID)"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            error={errors.planId?.message}
            {...register('planId')}
          />
          <Input
            id="lic-expiresAt"
            label="Data de Expiração (opcional)"
            type="date"
            {...register('expiresAt')}
          />
          <Input
            id="lic-maxUsers"
            label="Máx. de Usuários (opcional)"
            type="number"
            min="1"
            placeholder="10"
            {...register('maxUsers')}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowManualModal(false); reset(); setManualError('') }}>
              Cancelar
            </Button>
            <Button type="submit" loading={createManualMutation.isPending}>Criar Licença</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
