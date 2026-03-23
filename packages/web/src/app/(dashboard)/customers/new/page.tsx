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

const schema = z.object({
  personType: z.enum(['PF', 'PJ']),
  document: z.string().min(11, 'Documento inválido'),
  name: z.string().min(2, 'Nome obrigatório'),
  tradeName: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  zipCode: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  complement: z.string().optional(),
  neighborhood: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function NewCustomerPage() {
  const router = useRouter()
  const [personType, setPersonType] = useState<'PF' | 'PJ'>('PF')
  const [error, setError] = useState('')

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { personType: 'PF' },
  })

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/customers', data),
    onSuccess: (res) => {
      router.push(`/customers/${res.data.id}`)
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setError(axiosErr?.response?.data?.message ?? 'Erro ao criar cliente')
    },
  })

  const handlePersonTypeChange = (type: 'PF' | 'PJ') => {
    setPersonType(type)
    setValue('personType', type)
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft size={16} /> Voltar
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Novo Cliente</h2>
          <p className="text-sm text-gray-500">Preencha os dados do novo cliente</p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-6">
        {/* Person Type */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Tipo de Pessoa</h3>
          </CardHeader>
          <CardBody>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handlePersonTypeChange('PF')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  personType === 'PF'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Pessoa Física
              </button>
              <button
                type="button"
                onClick={() => handlePersonTypeChange('PJ')}
                className={`flex-1 py-3 px-4 rounded-lg border-2 text-sm font-medium transition-colors ${
                  personType === 'PJ'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                Pessoa Jurídica
              </button>
            </div>
          </CardBody>
        </Card>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Dados Básicos</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="document"
                label={personType === 'PF' ? 'CPF' : 'CNPJ'}
                placeholder={personType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'}
                error={errors.document?.message}
                {...register('document')}
              />
              <Input
                id="email"
                label="E-mail"
                type="email"
                placeholder="contato@empresa.com"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            <Input
              id="name"
              label={personType === 'PF' ? 'Nome Completo' : 'Razão Social'}
              placeholder={personType === 'PF' ? 'João da Silva' : 'Empresa LTDA'}
              error={errors.name?.message}
              {...register('name')}
            />

            {personType === 'PJ' && (
              <Input
                id="tradeName"
                label="Nome Fantasia"
                placeholder="Nome Fantasia"
                {...register('tradeName')}
              />
            )}

            <Input
              id="phone"
              label="Telefone"
              placeholder="(11) 99999-9999"
              {...register('phone')}
            />
          </CardBody>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Endereço</h3>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="zipCode" label="CEP" placeholder="00000-000" {...register('zipCode')} />
              <div className="md:col-span-2">
                <Input id="street" label="Rua / Logradouro" placeholder="Rua das Flores" {...register('street')} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="number" label="Número" placeholder="123" {...register('number')} />
              <Input id="complement" label="Complemento" placeholder="Apto 101" {...register('complement')} />
              <Input id="neighborhood" label="Bairro" placeholder="Centro" {...register('neighborhood')} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input id="city" label="Cidade" placeholder="São Paulo" {...register('city')} />
              <Select
                id="state"
                label="Estado"
                placeholder="Selecione"
                options={[
                  { value: 'AC', label: 'Acre' }, { value: 'AL', label: 'Alagoas' },
                  { value: 'AP', label: 'Amapá' }, { value: 'AM', label: 'Amazonas' },
                  { value: 'BA', label: 'Bahia' }, { value: 'CE', label: 'Ceará' },
                  { value: 'DF', label: 'Distrito Federal' }, { value: 'ES', label: 'Espírito Santo' },
                  { value: 'GO', label: 'Goiás' }, { value: 'MA', label: 'Maranhão' },
                  { value: 'MT', label: 'Mato Grosso' }, { value: 'MS', label: 'Mato Grosso do Sul' },
                  { value: 'MG', label: 'Minas Gerais' }, { value: 'PA', label: 'Pará' },
                  { value: 'PB', label: 'Paraíba' }, { value: 'PR', label: 'Paraná' },
                  { value: 'PE', label: 'Pernambuco' }, { value: 'PI', label: 'Piauí' },
                  { value: 'RJ', label: 'Rio de Janeiro' }, { value: 'RN', label: 'Rio Grande do Norte' },
                  { value: 'RS', label: 'Rio Grande do Sul' }, { value: 'RO', label: 'Rondônia' },
                  { value: 'RR', label: 'Roraima' }, { value: 'SC', label: 'Santa Catarina' },
                  { value: 'SP', label: 'São Paulo' }, { value: 'SE', label: 'Sergipe' },
                  { value: 'TO', label: 'Tocantins' },
                ]}
                {...register('state')}
              />
            </div>
          </CardBody>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-gray-900">Observações</h3>
          </CardHeader>
          <CardBody>
            <Textarea
              id="notes"
              placeholder="Observações internas sobre o cliente..."
              rows={3}
              {...register('notes')}
            />
          </CardBody>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Criar Cliente
          </Button>
        </div>
      </form>
    </div>
  )
}
