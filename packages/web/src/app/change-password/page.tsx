'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuth } from '@/contexts/AuthContext'
import { api } from '@/lib/api'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ShieldCheck } from 'lucide-react'

const schema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
  newPassword: z
    .string()
    .min(8, 'A senha deve ter no mínimo 8 caracteres')
    .regex(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, 'A senha deve conter maiúsculas, minúsculas, números e caracteres especiais'),
  confirmPassword: z.string().min(1, 'Confirme a nova senha'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
})

type FormData = z.infer<typeof schema>

export default function ChangePasswordPage() {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { token, admin, setAdmin } = useAuth()

  useEffect(() => {
    if (!token) {
      router.push('/login')
    } else if (!admin?.mustChangePassword) {
      router.push('/dashboard')
    }
  }, [token, admin, router])

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    try {
      setIsLoading(true)
      setError('')
      
      await api.patch('/auth/change-password', {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      })
      
      if (admin) {
        const updatedAdmin = { ...admin, mustChangePassword: false }
        setAdmin(updatedAdmin)
        localStorage.setItem('hub_admin', JSON.stringify(updatedAdmin))
      }
      
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao alterar senha. Verifique a senha atual.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!admin?.mustChangePassword) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Troca Obrigatória</h1>
              <p className="text-xs text-gray-500">Defina sua nova senha segura</p>
            </div>
          </div>

          <div className="mb-6 p-4 bg-blue-50 text-blue-800 text-sm rounded-lg border border-blue-200">
            Como este é seu primeiro acesso com a senha padrão, você precisa definir uma nova senha forte para continuar.
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="currentPassword"
              label="Senha Atual"
              type="password"
              placeholder="Digite a senha atual"
              error={errors.currentPassword?.message}
              {...register('currentPassword')}
            />

            <Input
              id="newPassword"
              label="Nova Senha"
              type="password"
              placeholder="Digite a nova senha"
              error={errors.newPassword?.message}
              {...register('newPassword')}
            />
            
            <Input
              id="confirmPassword"
              label="Confirmar Nova Senha"
              type="password"
              placeholder="Digite novamente a nova senha"
              error={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />

            <Button type="submit" className="w-full mt-2" loading={isLoading}>
              Salvar Senha e Continuar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
