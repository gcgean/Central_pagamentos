'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth, type LoginChallenge } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { BarChart3, Eye, EyeOff, ShieldCheck } from 'lucide-react'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login, confirmLoginCode } = useAuth()
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  // Verificação em duas etapas: depois da senha, o código enviado por e-mail.
  const [desafio, setDesafio] = useState<LoginChallenge | null>(null)
  const [codigo, setCodigo] = useState('')
  const [confiar, setConfiar] = useState(true)
  const [conferindo, setConferindo] = useState(false)
  const [aviso, setAviso] = useState('')

  const mensagemDoErro = (err: unknown, padrao: string) => {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    return axiosErr?.response?.data?.message ?? padrao
  }

  const confirmarCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!desafio || codigo.length !== 6) return
    setError('')
    setConferindo(true)
    try {
      await confirmLoginCode(desafio.challengeId, codigo, confiar)
    } catch (err) {
      setError(mensagemDoErro(err, 'Não foi possível conferir o código.'))
      setCodigo('')
    } finally {
      setConferindo(false)
    }
  }

  const reenviar = async () => {
    if (!desafio) return
    setError('')
    setAviso('')
    try {
      const { data } = await api.post('/auth/login/2fa/resend', { challengeId: desafio.challengeId })
      setDesafio({ ...desafio, challengeId: data.challengeId, previewCode: data.previewCode })
      setAviso('Enviamos um código novo.')
    } catch (err) {
      setError(mensagemDoErro(err, 'Não foi possível reenviar o código.'))
    }
  }

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      const pendente = await login(data.email, data.password)
      if (pendente) {
        setDesafio(pendente)
        setCodigo('')
        setAviso('')
      }
    } catch (err: unknown) {
      setError(mensagemDoErro(err, 'Credenciais inválidas. Tente novamente.'))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <BarChart3 size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Hub Billing</h1>
              <p className="text-xs text-gray-500">Painel Administrativo</p>
            </div>
          </div>

          <div className="mb-6">
            {desafio ? (
              <>
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <ShieldCheck size={22} className="text-blue-600" /> Verificação
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Enviamos um código de 6 números para <strong>{desafio.emailMasked}</strong>. Ele vale por 10 minutos.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900">Entrar</h2>
                <p className="text-sm text-gray-500 mt-1">Faça login para acessar o painel</p>
              </>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {aviso && desafio && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{aviso}</p>
            </div>
          )}

          {desafio ? (
            <form onSubmit={confirmarCodigo} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="codigo" className="block text-sm font-medium text-gray-700">Código</label>
                <input
                  id="codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  placeholder="000000"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="block w-full rounded-md border border-gray-300 px-3 py-2 text-center text-2xl tracking-[0.5em] font-semibold shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {desafio.previewCode && (
                  <p className="text-xs text-amber-600">Ambiente de teste, sem e-mail: código {desafio.previewCode}</p>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={confiar} onChange={(e) => setConfiar(e.target.checked)} className="rounded border-gray-300" />
                Confiar neste aparelho por 30 dias
              </label>

              <Button type="submit" loading={conferindo} disabled={codigo.length !== 6} className="w-full justify-center py-2.5" size="lg">
                {conferindo ? 'Conferindo...' : 'Confirmar'}
              </Button>

              <div className="flex justify-between text-sm">
                <button type="button" onClick={() => { setDesafio(null); setError(''); setAviso('') }} className="text-gray-500 hover:text-gray-700">
                  Voltar
                </button>
                <button type="button" onClick={reenviar} className="text-blue-600 hover:text-blue-700">
                  Reenviar código
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="email"
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={`block w-full rounded-md border px-3 py-2 text-sm placeholder-gray-400 shadow-sm pr-10 focus:outline-none focus:ring-1 ${
                    errors.password
                      ? 'border-red-400 focus:border-red-500 focus:ring-red-500'
                      : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full justify-center py-2.5"
              size="lg"
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 mt-6">
          Hub Billing Admin Panel &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
