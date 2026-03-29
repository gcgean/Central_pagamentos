'use client'
import { useState, useEffect, useRef } from 'react'
import { Check, Copy, BookOpen, Key, Zap, Webhook, AlertCircle, ChevronRight, ExternalLink, Code2, ShieldCheck } from 'lucide-react'

// ── Code Block ────────────────────────────────────────────────────────────────

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group rounded-xl overflow-hidden border border-gray-800 my-4">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <span className="text-xs text-gray-400 font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          {copied ? <><Check size={12} className="text-green-400" /> Copiado</> : <><Copy size={12} /> Copiar</>}
        </button>
      </div>
      <pre className="bg-gray-950 text-gray-100 p-4 overflow-x-auto text-sm leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ── Method Badge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET:    'bg-blue-500/10 text-blue-400 border-blue-500/30',
    POST:   'bg-green-500/10 text-green-400 border-green-500/30',
    PUT:    'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    DELETE: 'bg-red-500/10 text-red-400 border-red-500/30',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold font-mono border ${colors[method] ?? 'bg-gray-500/10 text-gray-400'}`}>
      {method}
    </span>
  )
}

// ── Endpoint Card ─────────────────────────────────────────────────────────────

function Endpoint({ method, path, description, children }: {
  method: string; path: string; description: string; children?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 text-left"
      >
        <MethodBadge method={method} />
        <code className="text-sm font-mono text-gray-800 flex-1">{path}</code>
        <span className="text-sm text-gray-500 hidden sm:block">{description}</span>
        <ChevronRight size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 bg-gray-50 border-t border-gray-200">
          <p className="text-sm text-gray-600 mt-3 mb-1">{description}</p>
          {children}
        </div>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ id, title, icon, children }: {
  id: string; title: string; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-6 mb-12">
      <div className="flex items-center gap-3 mb-6 pb-3 border-b border-gray-200">
        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">{icon}</div>
        <h2 className="text-xl font-bold text-gray-900">{title}</h2>
      </div>
      {children}
    </section>
  )
}

// ── Prop Table ────────────────────────────────────────────────────────────────

function PropTable({ rows }: { rows: { name: string; type: string; required?: boolean; description: string }[] }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tl-lg">Campo</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-700">Tipo</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-700">Req.</th>
            <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tr-lg">Descrição</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-3 py-2 font-mono text-blue-700 font-medium">{r.name}</td>
              <td className="px-3 py-2 font-mono text-purple-600">{r.type}</td>
              <td className="px-3 py-2">{r.required ? <span className="text-red-500 font-bold">✓</span> : <span className="text-gray-300">—</span>}</td>
              <td className="px-3 py-2 text-gray-600">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Alert ─────────────────────────────────────────────────────────────────────

function Alert({ type, children }: { type: 'info' | 'warning' | 'success'; children: React.ReactNode }) {
  const styles = {
    info:    'bg-blue-50 border-blue-200 text-blue-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    success: 'bg-green-50 border-green-200 text-green-800',
  }
  return (
    <div className={`flex gap-3 p-3 rounded-lg border my-4 ${styles[type]}`}>
      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
      <p className="text-sm">{children}</p>
    </div>
  )
}

// ── Nav items ─────────────────────────────────────────────────────────────────

const navItems = [
  { id: 'overview',      label: 'Visão Geral' },
  { id: 'auth',          label: 'Autenticação' },
  { id: 'access',        label: 'Verificar Acesso' },
  { id: 'entitlements',  label: 'Entitlements' },
  { id: 'payments',      label: 'Pagamentos' },
  { id: 'webhooks',      label: 'Webhooks de Saída' },
  { id: 'webhook-in',    label: 'Webhooks de Entrada' },
  { id: 'errors',        label: 'Erros & Motivos' },
  { id: 'examples',      label: 'Exemplos de Código' },
  { id: 'sdks',          label: 'SDKs & Bibliotecas' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [active, setActive] = useState('overview')

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { rootMargin: '-10% 0% -80% 0%' }
    )
    navItems.forEach(item => {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="flex gap-8 min-h-full">

      {/* ── Sidebar de navegação ─────────────────────────────────────────── */}
      <aside className="hidden lg:block w-52 flex-shrink-0">
        <div className="sticky top-0 pt-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">Conteúdo</p>
          <nav className="space-y-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  active === item.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* ── Conteúdo principal ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 max-w-3xl">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-gray-100 rounded-lg">
            <BookOpen size={20} className="text-gray-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Documentação da API</h1>
            <p className="text-sm text-gray-500">Guia de integração para sistemas satélites</p>
          </div>
        </div>

        {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
        <Section id="overview" title="Visão Geral" icon={<BookOpen size={16} />}>
          <p className="text-gray-600 text-sm leading-relaxed mb-4">
            A API do <strong>Hub Billing</strong> permite que seus sistemas integrados verifiquem em tempo real se
            um cliente tem acesso a um produto, quais funcionalidades estão habilitadas e recebam notificações
            automáticas sobre eventos de pagamento.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              { icon: <Key size={20} />, title: 'API Key', desc: 'Autenticação simples via header HTTP' },
              { icon: <ShieldCheck size={20} />, title: 'Verificação de Acesso', desc: 'Valide licenças em < 50ms' },
              { icon: <Webhook size={20} />, title: 'Webhooks', desc: 'Receba eventos em tempo real' },
            ].map((c, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="text-blue-600 mb-2">{c.icon}</div>
                <p className="font-semibold text-sm text-gray-900">{c.title}</p>
                <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-gray-900 rounded-xl p-4">
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">Base URL</p>
            <code className="text-green-400 font-mono text-sm">https://seu-dominio.com/api/v1</code>
          </div>

          <Alert type="info">
            Todos os endpoints retornam JSON. O servidor aceita requisições com <code className="font-mono text-xs">Content-Type: application/json</code>.
          </Alert>
        </Section>

        {/* ── AUTENTICAÇÃO ─────────────────────────────────────────────────── */}
        <Section id="auth" title="Autenticação" icon={<Key size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Os endpoints de integração usam <strong>API Key</strong> gerada pelo painel em{' '}
            <strong>Integrações</strong>. Cada produto tem suas próprias chaves.
            Inclua a chave no header <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">X-API-Key</code> de todas as requisições.
          </p>

          <CodeBlock language="http" code={`GET /api/v1/access/customer/123/product/MEU_PRODUTO
Host: seu-dominio.com
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx`} />

          <Alert type="warning">
            Nunca exponha sua API Key no código front-end ou repositórios públicos.
            Use variáveis de ambiente no servidor.
          </Alert>

          <h3 className="font-semibold text-gray-900 mt-5 mb-2">Como gerar uma chave</h3>
          <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
            <li>Acesse o menu <strong>Integrações</strong> no painel</li>
            <li>Selecione o produto que o sistema vai acessar</li>
            <li>Clique em <strong>Gerar Nova Chave</strong></li>
            <li>Copie a chave exibida — ela não será mostrada novamente</li>
          </ol>

          <h3 className="font-semibold text-gray-900 mt-5 mb-2">Exemplo com variável de ambiente</h3>
          <CodeBlock language="bash" code={`# .env do seu sistema
HUB_BILLING_API_KEY=hub_live_xxxxxxxxxxxxxxxxxxxx
HUB_BILLING_BASE_URL=https://billing.seudominio.com/api/v1`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-2">Autenticação de gestão (JWT Admin)</h3>
          <p className="text-sm text-gray-600">
            Para criar pedidos, gerar cobranças e consultar status financeiro, use token JWT de admin.
            Esse fluxo é recomendado para integrações server-to-server de ERP/CRM.
          </p>
          <CodeBlock language="http" code={`POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "gcgean@hotmail.com",
  "password": "SUA_SENHA_FORTE"
}

HTTP/1.1 200
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "admin": {
    "id": "uuid",
    "role": "super_admin",
    "mustChangePassword": false
  }
}`} />
          <CodeBlock language="http" code={`Authorization: Bearer <accessToken>`} />
        </Section>

        {/* ── VERIFICAR ACESSO ─────────────────────────────────────────────── */}
        <Section id="access" title="Verificar Acesso" icon={<ShieldCheck size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            O endpoint principal de integração. Informe o ID do cliente e o código do produto para saber
            instantaneamente se o acesso deve ser liberado.
          </p>

          <Endpoint
            method="GET"
            path="/access/customer/{customerId}/product/{productCode}"
            description="Valida se o cliente tem licença ativa para o produto"
          >
            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Parâmetros de URL</h4>
            <PropTable rows={[
              { name: 'customerId', type: 'uuid', required: true, description: 'ID do cliente cadastrado no Hub Billing' },
              { name: 'productCode', type: 'string', required: true, description: 'Código único do produto (ex: SOFTX_PRO)' },
            ]} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Acesso Liberado (200)</h4>
            <CodeBlock language="json" code={`{
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "productCode": "SOFTX_PRO",
  "allowed": true,
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "licenseStatus": "active",
  "planCode": "PRO_MENSAL",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "features": {
    "max_users": 10,
    "export_pdf": true,
    "api_access": true,
    "white_label": false
  },
  "checkedAt": "2026-03-23T10:00:00.000Z"
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Acesso Negado (200)</h4>
            <CodeBlock language="json" code={`{
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "productCode": "SOFTX_PRO",
  "allowed": false,
  "reason": "license_suspended",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "checkedAt": "2026-03-23T10:00:00.000Z"
}`} />

            <Alert type="info">
              O HTTP status code sempre é <strong>200</strong>. Verifique o campo <code className="font-mono text-xs">allowed</code> para decidir se libera ou bloqueia o acesso.
            </Alert>
          </Endpoint>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Lógica recomendada no seu sistema</h3>
          <CodeBlock language="javascript" code={`// Middleware de verificação de acesso (Node.js)
async function checkAccess(customerId, productCode) {
  const res = await fetch(
    \`\${process.env.HUB_BILLING_BASE_URL}/access/customer/\${customerId}/product/\${productCode}\`,
    { headers: { 'X-API-Key': process.env.HUB_BILLING_API_KEY } }
  )
  const data = await res.json()

  if (!data.allowed) {
    throw new Error(\`Acesso negado: \${data.reason}\`)
  }

  // Acesso liberado — retorna as features do plano contratado
  return data.features
}`} />
        </Section>

        {/* ── ENTITLEMENTS ─────────────────────────────────────────────────── */}
        <Section id="entitlements" title="Entitlements (Todos os Produtos)" icon={<Zap size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Retorna todos os produtos e licenças de um cliente em uma única chamada.
            Ideal para carregar o perfil completo no login do usuário.
          </p>

          <Endpoint
            method="GET"
            path="/access/entitlements/{customerId}"
            description="Lista todos os produtos com acesso do cliente"
          >
            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta (200)</h4>
            <CodeBlock language="json" code={`{
  "customerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "checkedAt": "2026-03-23T10:00:00.000Z",
  "products": [
    {
      "productId": "111aaa22-bb33-cc44-dd55-ee6677889900",
      "productCode": "SOFTX_PRO",
      "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
      "allowed": true,
      "licenseStatus": "active",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "features": {
        "max_users": 10,
        "export_pdf": true
      }
    },
    {
      "productId": "aabbccdd-eeff-0011-2233-445566778899",
      "productCode": "SOFTX_BASIC",
      "licenseId": "deadbeef-cafe-babe-face-0123456789ab",
      "allowed": false,
      "licenseStatus": "suspended",
      "expiresAt": null,
      "features": null
    }
  ]
}`} />
          </Endpoint>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Padrão recomendado no login</h3>
          <CodeBlock language="javascript" code={`// Ao fazer login, carrega todos os produtos de uma vez
// e armazena em cache (ex: session/Redis)
async function loadUserProfile(customerId) {
  const { data } = await hubBillingClient.get(\`/access/entitlements/\${customerId}\`)

  const allowedProducts = data.products
    .filter(p => p.allowed)
    .reduce((acc, p) => {
      acc[p.productCode] = p.features
      return acc
    }, {})

  // Ex: { SOFTX_PRO: { max_users: 10, export_pdf: true } }
  return allowedProducts
}`} />
        </Section>

        <Section id="payments" title="Processamento de Pagamentos" icon={<ExternalLink size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Fluxo recomendado para sistemas externos que precisam processar cobrança:
            <strong> criar pedido/assinatura → gerar checkout → acompanhar status da cobrança → receber confirmação via webhook</strong>.
          </p>

          <Endpoint
            method="POST"
            path="/orders"
            description="Cria pedido avulso para cobrança one-time"
          >
            <PropTable rows={[
              { name: 'customerId', type: 'uuid', required: true, description: 'ID do cliente no Hub Billing' },
              { name: 'productId', type: 'uuid', required: true, description: 'ID do produto' },
              { name: 'planId', type: 'uuid', required: true, description: 'ID do plano contratado' },
              { name: 'contractedAmount', type: 'number', required: true, description: 'Valor em centavos (ex: 9900 = R$ 99,00)' },
            ]} />
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "contractedAmount": 99
}`} />
          </Endpoint>

          <Endpoint
            method="POST"
            path="/orders/{orderId}/checkout"
            description="Gera cobrança PIX, cartão ou boleto para o pedido"
          >
            <PropTable rows={[
              { name: 'billingType', type: `'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'`, required: true, description: 'Método de pagamento' },
              { name: 'installmentCount', type: 'number', required: false, description: 'Parcelas (cartão)' },
              { name: 'creditCard.token', type: 'string', required: false, description: 'Token do cartão (Mercado Pago.js/Asaas)' },
              { name: 'creditCard.paymentMethodId', type: 'string', required: false, description: 'Bandeira do cartão (ex: visa/master)' },
              { name: 'creditCard.issuerId', type: 'string', required: false, description: 'ID do emissor (quando aplicável)' },
            ]} />
            <CodeBlock language="json" code={`{
  "billingType": "PIX"
}`} />
            <CodeBlock language="json" code={`{
  "chargeId": "uuid-local-da-cobranca",
  "externalChargeId": "151589827825",
  "checkoutUrl": null,
  "pixQrCode": "data:image/png;base64,...",
  "pixPayload": "00020126...",
  "boletoUrl": null,
  "amount": 99,
  "currency": "BRL",
  "dueDate": "2026-03-31"
}`} />
          </Endpoint>

          <Endpoint
            method="GET"
            path="/payments/charges?originType=order|subscription&originId={id}"
            description="Consulta as cobranças já criadas para um pedido/assinatura"
          >
            <CodeBlock language="http" code={`GET /api/v1/payments/charges?originType=order&originId=d8912ff9-9d06-4ab1-88b2-50d64f61b12
Authorization: Bearer <accessToken>`} />
          </Endpoint>

          <Alert type="info">
            Os endpoints de cobrança usam <strong>Authorization: Bearer</strong> (JWT admin), enquanto os endpoints de validação
            de acesso usam <strong>X-API-Key</strong>.
          </Alert>
        </Section>

        <Section id="webhooks" title="Webhooks de Saída (Hub → Seu Sistema)" icon={<Webhook size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Funcionalidade ativa. O Hub entrega eventos para a <strong>webhook_url do produto</strong> quando há mudanças
            de cobrança/licença. A assinatura é enviada no header <code className="font-mono text-xs">X-Hub-Signature</code>.
          </p>

          <Alert type="info">
            Configure no cadastro do produto: <strong>webhook_url</strong> e <strong>webhook_secret</strong>. O Hub assina
            o body com HMAC SHA-256 usando esse segredo.
          </Alert>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Eventos que serão notificados</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Evento</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Quando ocorre</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['payment.approved',  'Pagamento confirmado no gateway'],
                  ['payment.failed',    'Pagamento recusado/falhou no gateway'],
                  ['payment.chargeback','Chargeback detectado'],
                  ['pix.expired',       'Cobrança PIX expirada'],
                  ['subscription.canceled', 'Assinatura cancelada no gateway'],
                ].map(([event, desc], i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-mono text-blue-700 text-xs">{event}</td>
                    <td className="px-3 py-2 text-gray-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Formato do payload do webhook</h3>
          <CodeBlock language="json" code={`POST https://seu-sistema.com/webhooks/hub-billing

{
  "id": "f4dbe7a8-9cc2-41de-8d4d-4cf12531c72a",
  "type": "payment.approved",
  "productId": "9a8f0ec4-0a2e-4b52-a66f-96e2fca7b2f4",
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "payload": {
    "chargeId": "151589827825",
    "status": "approved",
    "amount": 99
  },
  "createdAt": "2026-03-28T21:27:16.000Z"
}

// Headers:
X-Hub-Signature: sha256=abc123...
X-Hub-Event: payment.approved`} />

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Validação da assinatura</h3>
          <CodeBlock language="javascript" code={`import crypto from 'crypto'

function isValidHubSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = String(signature).replace('sha256=', '')
  return expected === received
}`} />
        </Section>

        {/* ── WEBHOOKS DE ENTRADA ──────────────────────────────────────────── */}
        <Section id="webhook-in" title="Webhooks de Entrada (Gateway → Hub)" icon={<Code2 size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Configure no painel do seu gateway de pagamento a URL abaixo para receber notificações
            de cobranças. O Hub Billing processa automaticamente e atualiza licenças/assinaturas.
          </p>

          <div className="bg-gray-900 rounded-xl p-4 mb-4">
            <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wider">URL do Webhook</p>
            <div className="space-y-2">
              <div>
                <span className="text-gray-500 text-xs mr-2">Mercado Pago:</span>
                <code className="text-green-400 font-mono text-sm">https://seu-dominio.com/api/v1/webhooks/gateway/mercadopago</code>
              </div>
              <div>
                <span className="text-gray-500 text-xs mr-2">Asaas:</span>
                <code className="text-green-400 font-mono text-sm">https://seu-dominio.com/api/v1/webhooks/gateway/asaas</code>
              </div>
            </div>
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Como configurar no Mercado Pago</h3>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside mb-4">
            <li>Acesse <strong>Developers → Suas integrações → Notificações Webhooks</strong></li>
            <li>Cole a URL acima no campo <strong>URL</strong></li>
            <li>Marque os eventos: <strong>Payments, Subscriptions, Plans</strong></li>
            <li>Copie o <strong>Secret</strong> gerado e salve em <strong>Configurações → Gateway</strong> no Hub</li>
          </ol>

          <Alert type="success">
            O Hub Billing implementa <strong>idempotência automática</strong> — eventos duplicados são ignorados sem reprocessamento.
          </Alert>
        </Section>

        {/* ── ERROS ────────────────────────────────────────────────────────── */}
        <Section id="errors" title="Erros & Motivos de Negação" icon={<AlertCircle size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Quando <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">allowed: false</code>,
            o campo <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">reason</code> indica o motivo exato.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">reason</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Causa</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Ação recomendada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  ['customer_not_found', 'Cliente não existe no Hub', 'Verificar o customerId enviado'],
                  ['customer_blocked',   'Cliente está bloqueado', 'Exibir mensagem de conta suspensa'],
                  ['product_not_found',  'productCode inválido', 'Verificar o código do produto'],
                  ['no_license',         'Cliente não tem licença para o produto', 'Direcionar para página de compra'],
                  ['license_suspended',  'Licença suspensa por inadimplência', 'Exibir aviso de pagamento pendente'],
                  ['license_expired',    'Licença expirada', 'Direcionar para renovação'],
                  ['license_revoked',    'Licença revogada pelo admin', 'Contatar suporte'],
                  ['license_inactive',   'Licença inativa (não iniciada)', 'Aguardar ativação'],
                  ['grace_period',       'Em período de carência (allowed: true)', 'Exibir aviso de renovação'],
                ].map(([reason, cause, action], i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-mono text-red-600 text-xs font-medium">{reason}</td>
                    <td className="px-3 py-2 text-gray-600">{cause}</td>
                    <td className="px-3 py-2 text-gray-500">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Erros HTTP</h3>
          <PropTable rows={[
            { name: '200', type: 'OK',          description: 'Requisição processada. Verifique o campo allowed.' },
            { name: '401', type: 'Unauthorized', description: 'API Key ausente, inválida ou revogada.' },
            { name: '403', type: 'Forbidden',    description: 'Token JWT sem permissão para o endpoint administrativo.' },
            { name: '404', type: 'Not Found', description: 'Recurso não encontrado (pedido, assinatura, cliente, produto).' },
            { name: '422', type: 'Unprocessable', description: 'UUID inválido, documento inválido ou payload malformado.' },
            { name: '500', type: 'Server Error', description: 'Erro interno. Tente novamente em alguns segundos.' },
          ]} />
        </Section>

        {/* ── EXEMPLOS DE CÓDIGO ───────────────────────────────────────────── */}
        <Section id="examples" title="Exemplos de Código" icon={<Code2 size={16} />}>

          <h3 className="font-semibold text-gray-900 mb-3">Node.js / TypeScript</h3>
          <CodeBlock language="typescript" code={`// hubBillingClient.ts
const BASE_URL = process.env.HUB_BILLING_BASE_URL!
const API_KEY  = process.env.HUB_BILLING_API_KEY!

interface AccessResult {
  allowed: boolean
  reason?: string
  features?: Record<string, unknown>
  expiresAt?: string | null
}

export async function checkAccess(
  customerId: string,
  productCode: string
): Promise<AccessResult> {
  const res = await fetch(
    \`\${BASE_URL}/access/customer/\${customerId}/product/\${productCode}\`,
    {
      headers: {
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      // Nunca cache respostas de acesso por mais de 60s
      next: { revalidate: 60 },
    }
  )

  if (res.status === 401) throw new Error('API Key inválida')
  if (res.status === 429) throw new Error('Rate limit atingido')
  if (!res.ok) throw new Error(\`Hub Billing error: \${res.status}\`)

  return res.json()
}

// Uso:
const access = await checkAccess(user.hubCustomerId, 'SOFTX_PRO')
if (!access.allowed) {
  redirect('/planos')
}
const maxUsers = access.features?.max_users as number`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">Python</h3>
          <CodeBlock language="python" code={`# hub_billing.py
import os
import requests
from functools import lru_cache

BASE_URL = os.environ["HUB_BILLING_BASE_URL"]
API_KEY  = os.environ["HUB_BILLING_API_KEY"]

session = requests.Session()
session.headers.update({"X-API-Key": API_KEY})

def check_access(customer_id: str, product_code: str) -> dict:
    """Verifica se o cliente tem acesso ao produto."""
    url = f"{BASE_URL}/access/customer/{customer_id}/product/{product_code}"
    response = session.get(url, timeout=5)
    response.raise_for_status()
    return response.json()

def get_entitlements(customer_id: str) -> dict:
    """Retorna todos os produtos do cliente."""
    url = f"{BASE_URL}/access/entitlements/{customer_id}"
    response = session.get(url, timeout=5)
    response.raise_for_status()
    return response.json()

# Uso:
result = check_access("a1b2c3d4-...", "SOFTX_PRO")
if not result["allowed"]:
    raise PermissionError(f"Acesso negado: {result.get('reason')}")

features = result.get("features", {})
max_users = features.get("max_users", 1)`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">PHP</h3>
          <CodeBlock language="php" code={`<?php
// HubBillingClient.php
class HubBillingClient {
    private string $baseUrl;
    private string $apiKey;

    public function __construct() {
        $this->baseUrl = $_ENV['HUB_BILLING_BASE_URL'];
        $this->apiKey  = $_ENV['HUB_BILLING_API_KEY'];
    }

    public function checkAccess(string $customerId, string $productCode): array {
        $url = "{$this->baseUrl}/access/customer/{$customerId}/product/{$productCode}";

        $ctx = stream_context_create(['http' => [
            'header' => "X-API-Key: {$this->apiKey}\r\nContent-Type: application/json\r\n",
            'timeout' => 5,
        ]]);

        $body = file_get_contents($url, false, $ctx);
        if ($body === false) throw new RuntimeException('Hub Billing unreachable');

        return json_decode($body, true);
    }
}

// Uso:
$hub = new HubBillingClient();
$access = $hub->checkAccess($user['hub_customer_id'], 'SOFTX_PRO');

if (!$access['allowed']) {
    http_response_code(403);
    die(json_encode(['error' => 'Sem licença ativa']));
}

$maxUsers = $access['features']['max_users'] ?? 1;`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">cURL (linha de comando)</h3>
          <CodeBlock language="bash" code={`# Verificar acesso
curl -s \\
  -H "X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx" \\
  "https://billing.seudominio.com/api/v1/access/customer/UUID_DO_CLIENTE/product/SOFTX_PRO" \\
  | jq .

# Listar todos os produtos do cliente
curl -s \\
  -H "X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx" \\
  "https://billing.seudominio.com/api/v1/access/entitlements/UUID_DO_CLIENTE" \\
  | jq '.products[] | select(.allowed == true)'`} />
        </Section>

        {/* ── SDKs ─────────────────────────────────────────────────────────── */}
        <Section id="sdks" title="SDKs & Boas Práticas" icon={<Zap size={16} />}>

          <h3 className="font-semibold text-gray-900 mb-3">Cache recomendado</h3>
          <p className="text-sm text-gray-600 mb-3">
            O endpoint de acesso é rápido (&lt;50ms), mas para alta volumetria recomendamos cache de curta duração:
          </p>
          <CodeBlock language="javascript" code={`// Com Redis (Node.js)
async function checkAccessCached(customerId, productCode, redis) {
  const cacheKey = \`access:\${customerId}:\${productCode}\`

  // Tenta cache primeiro (TTL 60s)
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const result = await checkAccess(customerId, productCode)

  // Não cacheia negações por muito tempo (pode ter renovado)
  const ttl = result.allowed ? 60 : 10
  await redis.setex(cacheKey, ttl, JSON.stringify(result))

  return result
}`} />

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Checklist de integração</h3>
          <div className="space-y-2">
            {[
              'Gere uma API Key exclusiva por sistema/ambiente (não reutilize entre produção e dev)',
              'Armazene a API Key em variáveis de ambiente, nunca no código-fonte',
              'Implemente tratamento de erro para status 401, 429 e 5xx',
              'Use cache de 30–60s para reduzir requisições em alta volumetria',
              'Configure webhook para invalidar cache automaticamente quando a licença mudar',
              'Registre o customerId do Hub Billing na base do seu sistema no momento do cadastro',
              'Teste com o endpoint antes de ir para produção usando uma API Key de homologação',
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-xs text-gray-400 font-bold">{i + 1}</span>
                </div>
                <p className="text-sm text-gray-600">{item}</p>
              </div>
            ))}
          </div>

          <Alert type="success">
            Precisa de ajuda? Abra um ticket no sistema de suporte ou consulte os logs de auditoria em{' '}
            <strong>Dashboard → Logs de Auditoria</strong> para rastrear requisições.
          </Alert>
        </Section>

      </div>
    </div>
  )
}
