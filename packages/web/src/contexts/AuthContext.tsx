'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'

interface Admin { id: string; name: string; email: string; role: string; mustChangePassword?: boolean }
interface AuthContextType {
  admin: Admin | null
  token: string | null
  /** Devolve o desafio quando o aparelho ainda não é de confiança (verificação em duas etapas). */
  login: (email: string, password: string) => Promise<LoginChallenge | null>
  confirmLoginCode: (challengeId: string, code: string, trustDevice: boolean) => Promise<void>
  logout: () => void
  isLoading: boolean
  setAdmin: (admin: Admin) => void
}

export interface LoginChallenge { challengeId: string; emailMasked: string; previewCode?: string }

// "Confiar neste aparelho": token aleatório que dispensa o código por 30 dias.
const DEVICE_KEY = 'hub_trusted_device'
const lerAparelho = () => { try { return localStorage.getItem(DEVICE_KEY) || undefined } catch { return undefined } }

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
      try {
        const parsedAdmin = JSON.parse(storedAdmin)
        setToken(storedToken)
        setAdmin(parsedAdmin)
      } catch {
        localStorage.removeItem('hub_token')
        localStorage.removeItem('hub_admin')
        setToken(null)
        setAdmin(null)
      }
    }
    setIsLoading(false)
  }, [])

  const entrar = (data: { accessToken: string; admin: Admin; deviceToken?: string }) => {
    localStorage.setItem('hub_token', data.accessToken)
    localStorage.setItem('hub_admin', JSON.stringify(data.admin))
    if (data.deviceToken) localStorage.setItem(DEVICE_KEY, data.deviceToken)
    setToken(data.accessToken)
    setAdmin(data.admin)

    if (data.admin.mustChangePassword) {
      router.push('/change-password')
    } else {
      router.push('/dashboard')
    }
  }

  const login = async (email: string, password: string): Promise<LoginChallenge | null> => {
    const deviceToken = lerAparelho()
    const { data } = await api.post('/auth/login', { email, password, ...(deviceToken ? { deviceToken } : {}) })
    if (data.requires2fa) {
      return { challengeId: data.challengeId, emailMasked: data.emailMasked, previewCode: data.previewCode }
    }
    entrar(data)
    return null
  }

  const confirmLoginCode = async (challengeId: string, code: string, trustDevice: boolean) => {
    const { data } = await api.post('/auth/login/2fa', { challengeId, code, trustDevice })
    entrar(data)
  }

  const logout = () => {
    localStorage.removeItem('hub_token')
    localStorage.removeItem('hub_admin')
    setToken(null)
    setAdmin(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ admin, token, login, confirmLoginCode, logout, isLoading, setAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
