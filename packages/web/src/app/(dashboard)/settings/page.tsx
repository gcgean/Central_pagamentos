'use client'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import {
  Settings, CreditCard, CheckCircle2, XCircle,
  Eye, EyeOff, Zap, TestTube2, AlertCircle,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type ActiveGateway = 'mercadopago' | 'asaas'

interface GatewayConfig {
  activeGateway: ActiveGateway
  mercadopago: { accessToken: string; webhookSecret: string; isConfigured: boolean }
  asaas: { apiKey: string; isConfigured: boolean }
}

const schema = z.object({
  activeGateway: z.enum(['mercadopago', 'asaas']),
  mercadopago_accessToken: z.string().optional(),
  mercadopago_publicKey: z.string().optional(),
  mercadopago_webhookSecret: z.string().optional(),
  asaas_apiKey: z.string().optional(),
})

type FormData = z.infer<typeof schema>

// ── Componentes auxiliares ─────────────────────────────────────────────────────

function GatewayOption({
  value,
  selected,
  onSelect,
  icon,
  label,
  description,
  configured,
}: {
  value: ActiveGateway
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  label: string
  description: string
  configured?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-gray-200 hover:border-gray-300 bg-white'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 p-2 rounded-lg ${selected ? 'bg-blue-100' : 'bg-gray-100'}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold text-sm ${selected ? 'text-blue-700' : 'text-gray-800'}`}>
              {label}
            </span>
            {configured !== undefined && (
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {configured
                  ? <><CheckCircle2 size={10} /> Configurado</>
                  : <><AlertCircle size={10} /> Não configurado</>}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${
          selected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
        }`}>
          {selected && <div className="w-full h-full rounded-full bg-white scale-50" />}
        </div>
      </div>
    </button>
  )
}

function SecretInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  hint,
}: {
  id: string
  label: string
  placeholder?: string
  value: string
  onChange: (v: string) => void
  hint?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const { data: config, isLoading } = useQuery<GatewayConfig>({
    queryKey: ['settings-gateway'],
    queryFn: async () => {
      const { data } = await api.get('/settings/gateway')
      return data
    },
  })

  const { control, handleSubmit, watch, setValue, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      activeGateway: 'asaas',
      mercadopago_accessToken: '',
      mercadopago_webhookSecret: '',
      asaas_apiKey: '',
    },
    values: config
      ? {
          activeGateway: config.activeGateway,
          mercadopago_accessToken: '',
          mercadopago_webhookSecret: '',
          asaas_apiKey: '',
        }
      : undefined,
  })

  const activeGateway = watch('activeGateway')

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload: any = { activeGateway: data.activeGateway }
      if (data.mercadopago_accessToken || data.mercadopago_publicKey || data.mercadopago_webhookSecret) {
        payload.mercadopago = {}
        if (data.mercadopago_accessToken) payload.mercadopago.accessToken = data.mercadopago_accessToken
        if (data.mercadopago_publicKey) payload.mercadopago.publicKey = data.mercadopago_publicKey
        if (data.mercadopago_webhookSecret) payload.mercadopago.webhookSecret = data.mercadopago_webhookSecret
      }
      if (data.asaas_apiKey) {
        payload.asaas = { apiKey: data.asaas_apiKey }
      }
      const { data: res } = await api.put('/settings/gateway', payload)
      return res
    },
    onSuccess: (updated: GatewayConfig) => {
      queryClient.setQueryData(['settings-gateway'], updated)
      reset({
        activeGateway: updated.activeGateway,
        mercadopago_accessToken: '',
        mercadopago_webhookSecret: '',
        asaas_apiKey: '',
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  const testMutation = useMutation({
    mutationFn: async (gateway: ActiveGateway) => {
      const { data } = await api.post('/settings/gateway/test', { gateway })
      return data as { ok: boolean; message: string }
    },
    onSuccess: (res) => {
      setTestResult(res)
      setTimeout(() => setTestResult(null), 5000)
    },
    onError: (err: any) => {
      setTestResult({
        ok: false,
        message: err?.response?.data?.message ?? 'Erro ao testar gateway',
      })
      setTimeout(() => setTestResult(null), 5000)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Settings size={20} className="text-gray-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Configurações</h2>
          <p className="text-sm text-gray-500">Gateway de pagamento e credenciais</p>
        </div>
      </div>

      <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-6">

        {/* Gateway selector */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Gateway de Pagamento Ativo</h3>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <Controller
                name="activeGateway"
                control={control}
                render={({ field }) => (
                  <>
                    <GatewayOption
                      value="mercadopago"
                      selected={field.value === 'mercadopago'}
                      onSelect={() => field.onChange('mercadopago')}
                      icon={<Zap size={16} className="text-blue-600" />}
                      label="Mercado Pago"
                      description="PIX, Boleto e Cartão de Crédito via SDK oficial do Mercado Pago."
                      configured={config?.mercadopago.isConfigured}
                    />
                    <GatewayOption
                      value="asaas"
                      selected={field.value === 'asaas'}
                      onSelect={() => field.onChange('asaas')}
                      icon={<CreditCard size={16} className="text-green-600" />}
                      label="Asaas"
                      description="Cobrança via API Asaas — PIX, Boleto e Cartão."
                      configured={config?.asaas.isConfigured}
                    />
                  </>
                )}
              />
            </div>
          </CardBody>
        </Card>

        {/* Mercado Pago credentials */}
        {activeGateway === 'mercadopago' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-blue-600" />
                <h3 className="text-sm font-semibold text-gray-900">Credenciais — Mercado Pago</h3>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {config?.mercadopago.isConfigured && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 size={14} className="text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Credenciais configuradas</p>
                      <p className="text-xs text-green-600">
                        Token: <code className="font-mono">{config.mercadopago.accessToken}</code>
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 space-y-1">
                  <p className="font-medium">Onde obter suas credenciais:</p>
                  <p>
                    Acesse{' '}
                    <a
                      href="https://www.mercadopago.com.br/developers/panel/app"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      mercadopago.com.br/developers/panel/app
                    </a>
                  </p>
                  <p>• Homologação: token começa com <code className="font-mono">TEST-</code></p>
                  <p>• Produção: token começa com <code className="font-mono">APP_USR-</code></p>
                </div>

                <Controller
                  name="mercadopago_accessToken"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id="mp-access-token"
                      label="Access Token (Obrigatório)"
                      placeholder={config?.mercadopago.isConfigured ? 'Deixe em branco para manter o atual' : 'TEST-xxxx ou APP_USR-xxxx'}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      hint="Chave de acesso da sua conta Mercado Pago"
                    />
                  )}
                />

                <Controller
                  // @ts-ignore - publicKey field added dynamically
                  name="mercadopago_publicKey"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id="mp-public-key"
                      label="Public Key (Para tokenização de Cartões)"
                      placeholder={config?.mercadopago.isConfigured ? 'Deixe em branco para manter a atual' : 'TEST-xxxx ou APP_USR-xxxx'}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      hint="Chave pública da sua conta Mercado Pago"
                    />
                  )}
                />

                <Controller
                  name="mercadopago_webhookSecret"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id="mp-webhook-secret"
                      label="Webhook Secret (Para validação de eventos)"
                      placeholder={config?.mercadopago.isConfigured ? 'Deixe em branco para manter o atual' : 'Senha do webhook no Mercado Pago'}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      hint="Usada para validar a autenticidade dos eventos recebidos do Mercado Pago"
                    />
                  )}
                />
              </div>
            </CardBody>
          </Card>
        )}

        {/* Asaas credentials */}
        {activeGateway === 'asaas' && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CreditCard size={16} className="text-green-600" />
                <h3 className="text-sm font-semibold text-gray-900">Credenciais — Asaas</h3>
              </div>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                {config?.asaas.isConfigured && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 size={14} className="text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-green-800">API Key configurada</p>
                      <p className="text-xs text-green-600 font-mono">{config.asaas.apiKey}</p>
                    </div>
                  </div>
                )}

                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
                  <p className="font-medium">Onde obter sua API Key:</p>
                  <p className="mt-1">
                    Acesse{' '}
                    <a
                      href="https://www.asaas.com/config/index"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      asaas.com/config/index
                    </a>
                    {' '}→ Integrações → API Key
                  </p>
                </div>

                <Controller
                  name="asaas_apiKey"
                  control={control}
                  render={({ field }) => (
                    <SecretInput
                      id="asaas-api-key"
                      label="API Key"
                      placeholder={config?.asaas.isConfigured ? 'Deixe em branco para manter a atual' : '$aact_xxxx'}
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      hint="Chave de API da sua conta Asaas"
                    />
                  )}
                />
              </div>
            </CardBody>
          </Card>
        )}

        {/* Test result */}
        {testResult && (
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            testResult.ok
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {testResult.ok
              ? <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
              : <XCircle size={16} className="text-red-600 flex-shrink-0" />}
            <p className="text-sm">{testResult.message}</p>
          </div>
        )}

        {/* Save success */}
        {saveSuccess && (
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-green-50 border-green-200 text-green-800">
            <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
            <p className="text-sm font-medium">Configurações salvas com sucesso!</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => testMutation.mutate(activeGateway)}
            loading={testMutation.isPending}
          >
            <TestTube2 size={14} /> Testar Conexão
          </Button>

          <Button type="submit" loading={saveMutation.isPending}>
            <CheckCircle2 size={14} /> Salvar Configurações
          </Button>
        </div>
      </form>
    </div>
  )
}
