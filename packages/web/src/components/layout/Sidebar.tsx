'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, Package, CreditCard, FileText,
  Key, ShieldCheck, LogOut, Zap, BarChart3, Settings, BookOpen,
} from 'lucide-react'

const nav = [
  { href: '/dashboard',    label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/customers',    label: 'Clientes',         icon: Users },
  { href: '/products',     label: 'Produtos & Planos', icon: Package },
  { href: '/subscriptions', label: 'Assinaturas',     icon: Zap },
  { href: '/orders',       label: 'Pedidos',          icon: FileText },
  { href: '/licenses',     label: 'Licenças',         icon: ShieldCheck },
  { href: '/integrations', label: 'Integrações',      icon: Key },
  { href: '/docs',         label: 'Documentação API', icon: BookOpen },
  { href: '/settings',     label: 'Configurações',    icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { admin, logout } = useAuth()

  return (
    <aside className="flex flex-col w-64 bg-gray-900 min-h-screen">
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <BarChart3 size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Hub Billing</p>
            <p className="text-gray-400 text-xs">Painel Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-800">
        <div className="px-3 py-2 mb-2">
          <p className="text-white text-sm font-medium truncate">{admin?.name}</p>
          <p className="text-gray-500 text-xs truncate">{admin?.email}</p>
          <span className="inline-block mt-1 px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded">
            {admin?.role}
          </span>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
        >
          <LogOut size={18} /> Sair
        </button>
      </div>
    </aside>
  )
}
