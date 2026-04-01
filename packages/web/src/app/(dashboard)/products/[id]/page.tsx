'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { ArrowLeft, Plus, Archive, Package, Pencil } from 'lucide-react'

interface Product {
  id: string
  code: string
  name: string
  description?: string
  isActive: boolean
  createdAt: string
}

interface Plan {
  id: string
  code: string
  name: string
  amount: number
  interval: string
  intervalUnit?: string
  intervalCount: number
  maxUsers?: number
  status?: string
  isArchived: boolean
  createdAt: string
}

const planSchema = z.object({
  code: z.string().min(2, 'Código obrigatório'),
  name: z.string().min(2, 'Nome obrigatório'),
  amount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Valor inválido'),
  interval: z.enum(['day', 'month', 'year']),
  intervalCount: z.coerce.number().int().min(1),
  maxUsers: z.coerce.number().int().min(1).optional(),
})

type PlanFormData = z.infer<typeof planSchema>

const intervalLabels: Record<string, string> = {
  day: 'Dia(s)',
  month: 'Mês(es)',
  year: 'Ano(s)',
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showEditPlanModal, setShowEditPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)
  const [error, setError] = useState('')
  const [planError, setPlanError] = useState('')

  const isArchived = (plan: Plan) => plan.isArchived || plan.status === 'archived'

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data } = await api.get(`/products/${id}`)
      return data
    },
  })

  const { data: plans, isLoading: loadingPlans } = useQuery<Plan[]>({
    queryKey: ['plans', id],
    queryFn: async () => {
      const { data } = await api.get(`/products/${id}/plans`)
      return data
    },
  })

  const toggleActiveMutation = useMutation({
    mutationFn: () => api.put(`/products/${id}`, { ...product, isActive: !product?.isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['product', id] }),
    onError: () => setError('Erro ao atualizar status'),
  })

  const archivePlanMutation = useMutation({
    mutationFn: (planId: string) => api.put(`/products/${id}/plans/${planId}/archive`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plans', id] }),
  })

  const { register, handleSubmit, reset, formState: { errors: planErrors } } = useForm<PlanFormData>({
    resolver: zodResolver(planSchema),
    defaultValues: { interval: 'month', intervalCount: 1 },
  })

  const createPlanMutation = useMutation({
    mutationFn: (data: PlanFormData) => {
      const { interval, ...rest } = data
      const payload = {
        ...rest,
        intervalUnit: interval,           // API espera intervalUnit
        amount: Math.round(parseFloat(data.amount) * 100),
        intervalCount: Number(data.intervalCount),
        maxUsers: data.maxUsers ? Number(data.maxUsers) : undefined,
      }
      return api.post(`/products/${id}/plans`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', id] })
      setShowPlanModal(false)
      reset()
      setPlanError('')
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setPlanError(axiosErr?.response?.data?.message ?? 'Erro ao criar plano')
    },
  })

  const updatePlanMutation = useMutation({
    mutationFn: (data: PlanFormData) => {
      if (!editingPlan) throw new Error('Plano não selecionado')
      const { interval, ...rest } = data
      const payload = {
        ...rest,
        intervalUnit: interval,
        amount: Math.round(parseFloat(data.amount) * 100),
        intervalCount: Number(data.intervalCount),
        maxUsers: data.maxUsers ? Number(data.maxUsers) : undefined,
      }
      return api.put(`/products/${id}/plans/${editingPlan.id}`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans', id] })
      setShowEditPlanModal(false)
      setEditingPlan(null)
      reset({ interval: 'month', intervalCount: 1 })
      setPlanError('')
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setPlanError(axiosErr?.response?.data?.message ?? 'Erro ao atualizar plano')
    },
  })

  const openEditPlanModal = (plan: Plan) => {
    setEditingPlan(plan)
    setPlanError('')
    reset({
      code: plan.code,
      name: plan.name,
      amount: (plan.amount / 100).toFixed(2),
      interval: (plan.intervalUnit ?? plan.interval ?? 'month') as 'day' | 'month' | 'year',
      intervalCount: plan.intervalCount,
      maxUsers: plan.maxUsers,
    })
    setShowEditPlanModal(true)
  }

  if (isLoading) return <Spinner />
  if (!product) return <div className="text-gray-500 text-sm">Produto não encontrado.</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Product Card */}
      <Card>
        <CardBody className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <code className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">{product.code}</code>
              <Badge variant={product.isActive ? 'green' : 'gray'}>
                {product.isActive ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">{product.name}</h2>
            {product.description && <p className="text-sm text-gray-500 mt-1">{product.description}</p>}
            <p className="text-xs text-gray-400 mt-2">Criado em {formatDate(product.createdAt)}</p>
          </div>
          <Button
            variant={product.isActive ? 'danger' : 'secondary'}
            size="sm"
            onClick={() => toggleActiveMutation.mutate()}
            loading={toggleActiveMutation.isPending}
          >
            {product.isActive ? 'Desativar' : 'Ativar'}
          </Button>
        </CardBody>
      </Card>

      {/* Plans */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Planos</h3>
          <Button size="sm" onClick={() => setShowPlanModal(true)}>
            <Plus size={14} /> Novo Plano
          </Button>
        </div>

        <Card>
          {loadingPlans ? (
            <Spinner />
          ) : !plans?.length ? (
            <EmptyState icon={Package} title="Nenhum plano" description="Crie o primeiro plano para este produto." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Código</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Periodicidade</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Max. Usuários</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {plans.map((plan) => (
                    <tr key={plan.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-1 rounded" title={plan.id}>
                          {plan.id}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <code className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">{plan.code}</code>
                      </td>
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{plan.name}</td>
                      <td className="px-6 py-3 text-sm text-gray-700 font-medium">{formatCurrency(plan.amount)}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        A cada {plan.intervalCount} {intervalLabels[plan.intervalUnit ?? plan.interval] ?? plan.intervalUnit ?? plan.interval}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{plan.maxUsers ?? '—'}</td>
                      <td className="px-6 py-3">
                        <Badge variant={isArchived(plan) ? 'gray' : 'green'}>
                          {isArchived(plan) ? 'Arquivado' : 'Ativo'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditPlanModal(plan)}
                          >
                            <Pencil size={14} /> Editar
                          </Button>
                          {!isArchived(plan) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => archivePlanMutation.mutate(plan.id)}
                              loading={archivePlanMutation.isPending}
                            >
                              <Archive size={14} /> Arquivar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* New Plan Modal */}
      <Modal open={showPlanModal} onClose={() => { setShowPlanModal(false); reset(); setPlanError('') }} title="Novo Plano">
        {planError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{planError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit((data) => createPlanMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="plan-code"
              label="Código"
              placeholder="BASICO"
              error={planErrors.code?.message}
              {...register('code', {
                onChange: (e) => { e.target.value = e.target.value.toUpperCase() },
              })}
            />
            <Input
              id="plan-name"
              label="Nome"
              placeholder="Plano Básico"
              error={planErrors.name?.message}
              {...register('name')}
            />
          </div>
          <Input
            id="plan-amount"
            label="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="99.90"
            error={planErrors.amount?.message}
            {...register('amount')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="plan-interval"
              label="Intervalo"
              options={[
                { value: 'day', label: 'Dia(s)' },
                { value: 'month', label: 'Mês(es)' },
                { value: 'year', label: 'Ano(s)' },
              ]}
              error={planErrors.interval?.message}
              {...register('interval')}
            />
            <Input
              id="plan-intervalCount"
              label="Quantidade"
              type="number"
              min="1"
              placeholder="1"
              error={planErrors.intervalCount?.message}
              {...register('intervalCount')}
            />
          </div>
          <Input
            id="plan-maxUsers"
            label="Máx. de Usuários (opcional)"
            type="number"
            min="1"
            placeholder="10"
            {...register('maxUsers')}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowPlanModal(false); reset(); setPlanError('') }}>
              Cancelar
            </Button>
            <Button type="submit" loading={createPlanMutation.isPending}>
              Criar Plano
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Plan Modal */}
      <Modal
        open={showEditPlanModal}
        onClose={() => { setShowEditPlanModal(false); setEditingPlan(null); reset({ interval: 'month', intervalCount: 1 }); setPlanError('') }}
        title="Editar Plano"
      >
        {planError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{planError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit((data) => updatePlanMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="plan-edit-code"
              label="Código"
              placeholder="BASICO"
              error={planErrors.code?.message}
              {...register('code', {
                onChange: (e) => { e.target.value = e.target.value.toUpperCase() },
              })}
            />
            <Input
              id="plan-edit-name"
              label="Nome"
              placeholder="Plano Básico"
              error={planErrors.name?.message}
              {...register('name')}
            />
          </div>
          <Input
            id="plan-edit-amount"
            label="Valor (R$)"
            type="number"
            step="0.01"
            min="0.01"
            placeholder="99.90"
            error={planErrors.amount?.message}
            {...register('amount')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              id="plan-edit-interval"
              label="Intervalo"
              options={[
                { value: 'day', label: 'Dia(s)' },
                { value: 'month', label: 'Mês(es)' },
                { value: 'year', label: 'Ano(s)' },
              ]}
              error={planErrors.interval?.message}
              {...register('interval')}
            />
            <Input
              id="plan-edit-intervalCount"
              label="Quantidade"
              type="number"
              min="1"
              placeholder="1"
              error={planErrors.intervalCount?.message}
              {...register('intervalCount')}
            />
          </div>
          <Input
            id="plan-edit-maxUsers"
            label="Máx. de Usuários (opcional)"
            type="number"
            min="1"
            placeholder="10"
            {...register('maxUsers')}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => { setShowEditPlanModal(false); setEditingPlan(null); reset({ interval: 'month', intervalCount: 1 }); setPlanError('') }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={updatePlanMutation.isPending}>
              Salvar Alterações
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
