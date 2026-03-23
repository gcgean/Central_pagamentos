'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { formatDate, formatDocument } from '@/lib/utils'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import { Search, Plus, Eye, Users } from 'lucide-react'

interface Customer {
  id: string
  name: string
  document: string
  email: string
  status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED'
  createdAt: string
  personType: 'PF' | 'PJ'
}

interface PaginatedResponse {
  data: Customer[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const statusColors: Record<string, 'green' | 'gray' | 'red'> = {
  ACTIVE: 'green',
  INACTIVE: 'gray',
  BLOCKED: 'red',
}

const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
}

export default function CustomersPage() {
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading } = useQuery<PaginatedResponse>({
    queryKey: ['customers', page, search, status],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(search && { search }),
        ...(status && { status }),
      })
      const { data } = await api.get(`/customers?${params}`)
      return data
    },
  })

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleStatusChange = (value: string) => {
    setStatus(value)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Clientes</h2>
          <p className="text-sm text-gray-500 mt-0.5">Gerencie os clientes da plataforma</p>
        </div>
        <Button onClick={() => router.push('/customers/new')}>
          <Plus size={16} /> Novo Cliente
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="px-6 py-4 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Buscar</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nome, e-mail ou documento..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button onClick={handleSearch} variant="outline">
                <Search size={16} />
              </Button>
            </div>
          </div>
          <div className="w-48">
            <Select
              label="Status"
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              options={[
                { value: 'ACTIVE', label: 'Ativo' },
                { value: 'INACTIVE', label: 'Inativo' },
                { value: 'BLOCKED', label: 'Bloqueado' },
              ]}
              placeholder="Todos"
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        {isLoading ? (
          <Spinner />
        ) : !data?.data?.length ? (
          <EmptyState icon={Users} title="Nenhum cliente encontrado" description="Tente ajustar os filtros ou crie um novo cliente." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Nome</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Documento</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">E-mail</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Criado em</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.data.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                          <p className="text-xs text-gray-400">{customer.personType === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">
                        {customer.document ? formatDocument(customer.document) : '—'}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{customer.email}</td>
                      <td className="px-6 py-3">
                        <Badge variant={statusColors[customer.status] ?? 'gray'}>
                          {statusLabels[customer.status] ?? customer.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-500">{formatDate(customer.createdAt)}</td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/customers/${customer.id}`)}
                        >
                          <Eye size={14} /> Ver
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.pagination && (
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                total={data.pagination.total}
                limit={data.pagination.limit}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </Card>
    </div>
  )
}
