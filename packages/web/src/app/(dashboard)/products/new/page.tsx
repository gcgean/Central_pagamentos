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
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ArrowLeft } from 'lucide-react'

const schema = z.object({
  code: z.string().min(2, 'Código obrigatório').regex(/^[A-Z0-9_-]+$/, 'Apenas letras maiúsculas, números e _-'),
  name: z.string().min(2, 'Nome obrigatório'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
})

type FormData = z.infer<typeof schema>

export default function NewProductPage() {
  const router = useRouter()
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true },
  })

  const isActive = watch('isActive')

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/products', data),
    onSuccess: (res) => {
      router.push(`/products/${res.data.id}`)
    },
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
                onChange: (e) => {
                  e.target.value = e.target.value.toUpperCase()
                },
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

            <Textarea
              id="description"
              label="Descrição"
              placeholder="Descreva o produto..."
              rows={3}
              {...register('description')}
            />

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
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    isActive ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <label className="text-sm text-gray-700">Produto ativo</label>
            </div>
          </CardBody>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Criar Produto
          </Button>
        </div>
      </form>
    </div>
  )
}
