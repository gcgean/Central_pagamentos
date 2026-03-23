'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff } from 'lucide-react'

interface Product { id: string; name: string; code: string }

interface ApiKey {
  id: string
  name: string
  keyPreview?: string
  productId: string
  productName?: string
  isActive: boolean
  lastUsedAt?: string
  createdAt: string
}

const createSchema = z.object({
  productId: z.string().min(1, 'Selecione um produto'),
  name: z.string().min(2, 'Nome obrigatório'),
})

type CreateFormData = z.infer<typeof createSchema>

export default function IntegrationsPage() {
  const queryClient = useQueryClient()
  const [selectedProductId, setSelectedProductId] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createError, setCreateError] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  const [showGeneratedKey, setShowGeneratedKey] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const { data: products } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get('/products')
      return data
    },
  })

  const { data: apiKeys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ['api-keys', selectedProductId],
    queryFn: async () => {
      const { data } = await api.get(`/integrations/api-keys/${selectedProductId}`)
      return data
    },
    enabled: !!selectedProductId,
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema),
    defaultValues: { productId: selectedProductId },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateFormData) => api.post('/integrations/api-keys', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedProductId] })
      const key = res.data.key ?? res.data.apiKey ?? res.data.token ?? ''
      if (key) {
        setGeneratedKey(key)
      } else {
        setShowCreateModal(false)
        reset()
      }
      setCreateError('')
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } }
      setCreateError(axiosErr?.response?.data?.message ?? 'Erro ao criar chave')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (keyId: string) => api.delete(`/integrations/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys', selectedProductId] })
      setDeleteConfirmId(null)
    },
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedKey)
    setCopiedKey(true)
    setTimeout(() => setCopiedKey(false), 2000)
  }

  const handleCloseGeneratedKey = () => {
    setGeneratedKey('')
    setShowCreateModal(false)
    reset()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Integrações</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie as chaves de API dos produtos</p>
        </div>
        <Button onClick={() => { setShowCreateModal(true); setGeneratedKey('') }}>
          <Plus size={16} /> Gerar Nova Chave
        </Button>
      </div>

      {/* Product Selector */}
      <Card>
        <CardBody>
          <div className="max-w-md">
            <Select
              id="product-filter"
              label="Selecione um produto para ver as chaves"
              placeholder="Selecione um produto"
              value={selectedProductId}
              options={(products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
              onChange={(e) => setSelectedProductId(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {/* API Keys Table */}
      {selectedProductId && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key size={16} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Chaves de API</h3>
            </div>
          </CardHeader>
          {isLoading ? (
            <Spinner />
          ) : !apiKeys?.length ? (
            <EmptyState icon={Key} title="Nenhuma chave de API" description="Gere uma nova chave para este produto." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Chave (Preview)</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Último Uso</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Criada em</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{key.name}</td>
                      <td className="px-6 py-3">
                        <code className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                          {key.keyPreview ?? '••••••••••••••••'}
                        </code>
                      </td>
                      <td className="px-6 py-3">
                        <Badge variant={key.isActive ? 'green' : 'gray'}>
                          {key.isActive ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">
                        {key.lastUsedAt ? formatDateTime(key.lastUsedAt) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{formatDateTime(key.createdAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmId(key.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 size={14} /> Revogar
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

      {/* Create Key Modal */}
      <Modal
        open={showCreateModal && !generatedKey}
        onClose={() => { setShowCreateModal(false); reset(); setCreateError('') }}
        title="Gerar Nova Chave de API"
        size="sm"
      >
        {createError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{createError}</p>
          </div>
        )}
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <Select
            id="key-productId"
            label="Produto"
            placeholder="Selecione um produto"
            options={(products ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
            error={errors.productId?.message}
            defaultValue={selectedProductId}
            {...register('productId')}
          />
          <Input
            id="key-name"
            label="Nome da chave"
            placeholder="Ex: Servidor de Produção"
            error={errors.name?.message}
            {...register('name')}
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="outline" onClick={() => { setShowCreateModal(false); reset(); setCreateError('') }}>
              Cancelar
            </Button>
            <Button type="submit" loading={createMutation.isPending}>Gerar Chave</Button>
          </div>
        </form>
      </Modal>

      {/* Generated Key Modal */}
      <Modal
        open={!!generatedKey}
        onClose={handleCloseGeneratedKey}
        title="Chave Gerada com Sucesso"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800 font-medium">Importante: Copie esta chave agora!</p>
            <p className="text-sm text-yellow-700 mt-1">Por segurança, esta chave não será exibida novamente.</p>
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Chave de API</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  readOnly
                  type={showGeneratedKey ? 'text' : 'password'}
                  value={generatedKey}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono bg-gray-50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowGeneratedKey(!showGeneratedKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showGeneratedKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Button variant="outline" onClick={handleCopy}>
                {copiedKey ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
              </Button>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleCloseGeneratedKey}>Fechar</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Modal */}
      <Modal
        open={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Revogar Chave de API"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-6">
          Tem certeza que deseja revogar esta chave? Qualquer integração usando esta chave deixará de funcionar imediatamente.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            loading={deleteMutation.isPending}
          >
            Revogar Chave
          </Button>
        </div>
      </Modal>
    </div>
  )
}
