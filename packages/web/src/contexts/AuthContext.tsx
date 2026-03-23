'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Admin { id: string; name: string; email: string; role: string }
interface AuthContextType {
  admin: Admin | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const storedToken = localStorage.getItem('hub_token')
    const storedAdmin = localStorage.getItem('hub_admin')
    if (storedToken && storedAdmin) {
      setToken(storedToken)
      setAdmin(JSON.parse(storedAdmin))
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('hub_token', data.accessToken)
    localStorage.setItem('hub_admin', JSON.stringify(data.admin))
    setToken(data.accessToken)
    setAdmin(data.admin)
    router.push('/dashboard')
  }

  const logout = () => {
    localStorage.removeItem('hub_token')
    localStorage.removeItem('hub_admin')
    setToken(null)
    setAdmin(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ admin, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
