'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ArrowLeft } from 'lucide-react'

const gatewayOptionValues = ['', 'asaas', 'mercadopago', 'livepix', 'stripe'] as const

const schema = z.object({
  code:        z.string().min(2, 'Código obrigatório').regex(/^[A-Z0-9_-]+$/, 'Apenas letras maiúsculas, números e _-'),
  name:        z.string().min(2, 'Nome obrigatório'),
  description: z.string().optional(),
  billingType: z.enum(['recurring', 'one_time', 'hybrid']),
  isActive:    z.boolean().default(true),
  gatewayName: z.enum(gatewayOptionValues).optional(),
  gatewayRoutingPix: z.enum(gatewayOptionValues).optional(),
  gatewayRoutingCard: z.enum(gatewayOptionValues).optional(),
  gatewayRoutingBoleto: z.enum(gatewayOptionValues).optional(),
})

type FormData = z.infer<typeof schema>

export default function NewProductPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { billingType: 'recurring', isActive: true },
  })

  const isActive = watch('isActive')

  const mutation = useMutation({
    mutationFn: (data: FormData) => {
      const { gatewayName, gatewayRoutingPix, gatewayRoutingCard, gatewayRoutingBoleto, ...rest } = data
      const gatewayRouting: Record<string, string> = {}
      if (gatewayRoutingPix) gatewayRouting.PIX = gatewayRoutingPix
      if (gatewayRoutingCard) gatewayRouting.CREDIT_CARD = gatewayRoutingCard
      if (gatewayRoutingBoleto) gatewayRouting.BOLETO = gatewayRoutingBoleto
      return api.post('/products', {
        ...rest,
        status: data.isActive ? 'active' : 'inactive',
        gatewayName: gatewayName || undefined,
        ...(Object.keys(gatewayRouting).length > 0 ? { gatewayRouting } : {}),
      })
    },
    onSuccess: (res) => router.push(`/products/${res.data.id}`),
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setError(axiosErr?.response?.data?.message ?? 'Erro ao criar produto')
    },
  })

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Novo Produto</h2>
          <p className="text-sm text-gray-500">Preencha os dados do novo produto</p>
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
            <h3 className="text-sm font-semibold text-gray-900">Informações do Produto</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <Input
              id="code"
              label="Código"
              placeholder="MINHA_APP"
              error={errors.code?.message}
              {...register('code', {
                onChange: (e) => { e.target.value = e.target.value.toUpperCase() },
              })}
            />
            <p className="text-xs text-gray-500 -mt-2">Apenas letras maiúsculas, números, _ e -</p>

            <Input
              id="name"
              label="Nome"
              placeholder="Minha Aplicação"
              error={errors.name?.message}
              {...register('name')}
            />

            <Select
              id="billingType"
              label="Tipo de Cobrança"
              options={[
                { value: 'recurring', label: 'Recorrente (assinatura)' },
                { value: 'one_time',  label: 'Avulso (pedido único)' },
                { value: 'hybrid',    label: 'Híbrido (ambos)' },
              ]}
              error={errors.billingType?.message}
              {...register('billingType')}
            />

            <Textarea
              id="description"
              label="Descrição"
              placeholder="Descreva o produto..."
              rows={3}
              {...register('description')}
            />

            <Select
              id="gatewayName"
              label="Gateway de Pagamento (opcional)"
              placeholder="Usar gateway padrão (Configurações)"
              options={[
                { value: 'asaas', label: 'Asaas' },
                { value: 'mercadopago', label: 'Mercado Pago' },
                { value: 'livepix', label: 'LivePix' },
                { value: 'stripe', label: 'Stripe' },
              ]}
              {...register('gatewayName')}
            />
            <p className="text-xs text-gray-500 -mt-2">
              Roteia as cobranças deste produto para um gateway específico, independente do gateway ativo global.
            </p>

            <div className="pt-2 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700">Personalizar por método de pagamento (opcional)</p>
              <p className="text-xs text-gray-500 mb-3">
                Quando definido, o método escolhido no checkout usa esse gateway específico — ignora o padrão acima.
              </p>
              <div className="space-y-3">
                <Select
                  id="gatewayRoutingPix"
                  label="PIX"
                  placeholder="Usar gateway padrão"
                  options={[
                    { value: 'asaas', label: 'Asaas' },
                    { value: 'mercadopago', label: 'Mercado Pago' },
                    { value: 'livepix', label: 'LivePix' },
                    { value: 'stripe', label: 'Stripe' },
                  ]}
                  {...register('gatewayRoutingPix')}
                />
                <Select
                  id="gatewayRoutingCard"
                  label="Cartão de Crédito"
                  placeholder="Usar gateway padrão"
                  options={[
                    { value: 'asaas', label: 'Asaas' },
                    { value: 'mercadopago', label: 'Mercado Pago' },
                    { value: 'livepix', label: 'LivePix' },
                    { value: 'stripe', label: 'Stripe' },
                  ]}
                  {...register('gatewayRoutingCard')}
                />
                <Select
                  id="gatewayRoutingBoleto"
                  label="Boleto"
                  placeholder="Usar gateway padrão"
                  options={[
                    { value: 'asaas', label: 'Asaas' },
                    { value: 'mercadopago', label: 'Mercado Pago' },
                    { value: 'livepix', label: 'LivePix' },
                    { value: 'stripe', label: 'Stripe' },
                  ]}
                  {...register('gatewayRoutingBoleto')}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={isActive}
                onClick={() => setValue('isActive', !isActive)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                  isActive ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
              <label className="text-sm text-gray-700">Produto ativo</label>
            </div>
          </CardBody>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancelar</Button>
          <Button type="submit" loading={mutation.isPending}>Criar Produto</Button>
        </div>
      </form>
    </div>
  )
}
