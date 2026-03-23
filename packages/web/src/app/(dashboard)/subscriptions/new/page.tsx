'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ArrowLeft } from 'lucide-react'

interface Product { id: string; name: string; code: string }
interface Plan { id: string; name: string; amount: number }

const schema = z.object({
  customerId: z.string().uuid('ID de cliente inválido (UUID)'),
  productId: z.string().min(1, 'Selecione um produto'),
  planId: z.string().min(1, 'Selecione um plano'),
  contractedAmount: z.string().refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Valor inválido'),
  trialDays: z.coerce.number().int().min(0).optional(),
})

type FormData = z.infer<typeof schema>

export default function NewSubscriptionPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [selectedProductId, setSelectedProductId] = useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { trialDays: 0 },
  })

  const productId = watch('productId')

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get('/products')
      return data
    },
  })

  const { data: plans } = useQuery<Plan[]>({
    queryKey: ['plans', productId],
    queryFn: async () => {
      const { data } = await api.get(`/products/${productId}/plans`)
      return data
    },
    enabled: !!productId,
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const payload = {
        customerId: data.customerId,
        planId: data.planId,
        contractedAmount: Math.round(parseFloat(data.contractedAmount) * 100),
        trialDays: data.trialDays ?? 0,
      }
      return api.post('/subscriptions', payload)
    },
    onSuccess: (res) => {
      router.push(`/subscriptions/${res.data.id}`)
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setError(axiosErr?.response?.data?.message ?? 'Erro ao criar assinatura')
    },
  })

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Nova Assinatura</h2>
          <p className="text-sm text-gray-500">Crie uma nova assinatura para um cliente</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Dados da Assinatura</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              id="customerId"
              label="ID do Cliente (UUID)"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              error={errors.customerId?.message}
              {...register('customerId')}
            />

            <Select
              id="productId"
              label="Produto"
              placeholder="Selecione um produto"
              options={(products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
              error={errors.productId?.message}
              {...register('productId', {
                onChange: (e) => {
                  setSelectedProductId(e.target.value)
                  setValue('planId', '')
                },
              })}
            />

            <Select
              id="planId"
              label="Plano"
              placeholder={productId ? 'Selecione um plano' : 'Selecione um produto primeiro'}
              options={(plans ?? []).map((p) => ({ value: p.id, label: p.name }))}
              error={errors.planId?.message}
              disabled={!productId || !plans?.length}
              {...register('planId')}
            />

            <Input
              id="contractedAmount"
              label="Valor Contratado (R$)"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="99.90"
              error={errors.contractedAmount?.message}
              {...register('contractedAmount')}
            />

            <Input
              id="trialDays"
              label="Dias de Trial (0 = sem trial)"
              type="number"
              min="0"
              placeholder="0"
              {...register('trialDays')}
            />
          </CardBody>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Criar Assinatura</Button>
        </div>
      </form>
    </div>
  )
}
