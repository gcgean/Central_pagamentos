'use client'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Plus, Eye, Package } from 'lucide-react'

interface Product {
  id: string
  code: string
  name: string
  description?: string
  isActive: boolean
  createdAt: string
}

export default function ProductsPage() {
  const router = useRouter()

  const { data, isLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await api.get('/products')
      return data
    },
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Produtos & Planos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie seus produtos e planos de assinatura</p>
        </div>
        <Button onClick={() => router.push('/products/new')}>
          <Plus size={16} /> Novo Produto
        </Button>
      </div>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data?.length ? (
          <EmptyState icon={Package} title="Nenhum produto cadastrado" description="Crie seu primeiro produto para começar." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3">
                      <code className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-mono">
                        {product.code}
                      </code>
                    </td>
                    <td className="px-6 py-3 text-sm font-medium text-gray-900">{product.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 max-w-xs truncate">
                      {product.description ?? '—'}
                    </td>
                    <td className="px-6 py-3">
                      <Badge variant={product.isActive ? 'green' : 'gray'}>
                        {product.isActive ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-sm text-gray-500">{formatDate(product.createdAt)}</td>
                    <td className="px-6 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => router.push(`/products/${product.id}`)}>
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
    </div>
  )
}
