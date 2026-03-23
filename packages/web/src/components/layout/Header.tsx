'use client'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/customers': 'Clientes',
  '/products': 'Produtos & Planos',
  '/subscriptions': 'Assinaturas',
  '/orders': 'Pedidos',
  '/licenses': 'Licenças',
  '/integrations': 'Integrações',
}

export function Header() {
  const pathname = usePathname()
  const base = '/' + pathname.split('/')[1]
  const title = titles[base] ?? 'Hub Billing'
  return (
    <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <button className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
        <Bell size={20} />
      </button>
    </header>
  )
}
