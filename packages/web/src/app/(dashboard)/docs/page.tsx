'use client'
import { useState, useEffect, useRef } from 'react'
import { Check, Copy, BookOpen, Key, Zap, Webhook, AlertCircle, ChevronRight, ExternalLink, Code2, ShieldCheck, Package } from 'lucide-react'

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
  { id: 'resolve',       label: 'Resolve Acesso' },
  { id: 'status',        label: 'Status de Acesso' },
  { id: 'trial',         label: 'Regras de Trial' },
  { id: 'customers-ext', label: 'Clientes Externos' },
  { id: 'access',        label: 'Validação Legada' },
  { id: 'entitlements',  label: 'Entitlements' },
  { id: 'plans-catalog', label: 'Catálogo de Planos' },
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

        {/* ── RESOLVE ACESSO ───────────────────────────────────────────────── */}
        <Section id="resolve" title="Resolve Acesso (Onboarding)" icon={<ShieldCheck size={16} />}>
          <Alert type="success">
            Este é o <strong>ponto de entrada principal</strong> para sistemas satélites. Chame este endpoint
            no login do usuário — ele cria o cliente se necessário, inicia trial automaticamente e
            retorna a decisão de acesso completa.
          </Alert>

          <p className="text-sm text-gray-600 mt-4 mb-4">
            O endpoint é <strong>idempotente</strong>: chamadas repetidas com o mesmo documento retornam
            o mesmo estado sem criar duplicidades.
          </p>
          <Alert type="info">
            Quando o cliente não possui CPF/CNPJ, envie apenas <code className="font-mono text-xs">name</code> e
            <code className="font-mono text-xs"> email</code>. O Hub cria um identificador interno automaticamente.
          </Alert>
          <Alert type="warning">
            Contrato atual de produção: cadastro por e-mail sem documento funciona para acesso/trial.
            Para PIX, envie dados do titular no checkout (<code className="font-mono text-xs">payerName</code> e <code className="font-mono text-xs">payerDocument</code>) quando o cliente não tiver documento válido salvo.
          </Alert>

          <Endpoint
            method="POST"
            path="/access/resolve"
            description="Onboarding centralizado — resolve cliente, trial e licença"
          >
            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Corpo da requisição</h4>
            <PropTable rows={[
              { name: 'document',   type: 'string',   required: false, description: 'CPF ou CNPJ (opcional). Sem documento, o Hub usa e-mail como referência.' },
              { name: 'personType', type: '"PF"|"PJ"', required: false, description: 'Tipo de pessoa (recomendado quando document for enviado)' },
              { name: 'productId',  type: 'uuid',     required: true,  description: 'ID do produto no Hub' },
              { name: 'name',       type: 'string',   required: true,  description: 'Nome completo ou Razão Social' },
              { name: 'email',      type: 'string',   required: true,  description: 'E-mail do cliente' },
            ]} />

            <CodeBlock language="http" code={`POST /api/v1/access/resolve
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "document": "123.456.789-09",
  "personType": "PF",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Maria Oliveira",
  "email": "maria@exemplo.com.br"
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Trial iniciado (primeiro acesso)</h4>
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "accessStatus": "trial",
  "trialStartedAt": "2026-03-29T10:00:00.000Z",
  "trialEndAt": "2026-04-12T10:00:00.000Z",
  "licenseEndAt": null,
  "daysLeft": 14,
  "reason": "trial_active",
  "features": { "max_users": 5, "reports": true },
  "canAccess": true,
  "banner": "Bem-vindo! Você tem 14 dias de avaliação gratuita."
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Licença paga ativa</h4>
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "accessStatus": "licensed",
  "trialStartedAt": null,
  "trialEndAt": null,
  "licenseEndAt": "2026-12-31T23:59:59.000Z",
  "daysLeft": 276,
  "reason": "licensed",
  "features": { "max_users": 10, "export_pdf": true },
  "canAccess": true,
  "banner": null
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Trial expirado (bloqueado)</h4>
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "accessStatus": "blocked",
  "trialStartedAt": null,
  "trialEndAt": "2026-03-22T10:00:00.000Z",
  "licenseEndAt": null,
  "daysLeft": null,
  "reason": "trial_expired",
  "features": null,
  "canAccess": false,
  "banner": "Seu período de avaliação expirou. Adquira uma licença para continuar."
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Valores possíveis para accessStatus</h4>
            <div className="overflow-x-auto my-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tl-lg">accessStatus</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700">canAccess</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tr-lg">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['trial',      'true',  'Em período de avaliação gratuita'],
                    ['licensed',   'true',  'Licença paga ativa (ou em carência)'],
                    ['blocked',    'false', 'Trial expirado, suspensão ou bloqueio manual'],
                    ['no_license', 'false', 'Produto sem trial configurado e sem licença'],
                  ].map(([status, access, desc], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 font-mono text-blue-700 font-medium">{status}</td>
                      <td className="px-3 py-2 font-mono text-purple-600">{access}</td>
                      <td className="px-3 py-2 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Alert type="info">
              Sempre verifique <code className="font-mono text-xs">canAccess</code> para liberar ou bloquear o sistema.
              Use o campo <code className="font-mono text-xs">banner</code> para exibir a mensagem pronta ao usuário quando não nulo.
            </Alert>
          </Endpoint>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Lógica recomendada no login</h3>
          <CodeBlock language="typescript" code={`// No login do usuário no seu sistema
async function onUserLogin(document: string, name: string, email: string) {
  const res = await fetch(\`\${HUB_URL}/access/resolve\`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      document,
      personType: 'PF',
      productId: process.env.HUB_PRODUCT_ID,
      name,
      email,
    }),
  })
  const data = await res.json()

  if (!data.canAccess) {
    // Redireciona para tela de conversão/compra
    return redirect(\`/planos?reason=\${data.accessStatus}\`)
  }

  // Armazena na sessão para consultas futuras
  session.hubCustomerId = data.customerId
  session.accessStatus  = data.accessStatus
  session.banner        = data.banner  // exibir se não null

  return data
}`} />
        </Section>

        {/* ── STATUS DE ACESSO ──────────────────────────────────────────────── */}
        <Section id="status" title="Status de Acesso (Consulta Periódica)" icon={<Zap size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Consulta o estado atual de acesso de um cliente para um produto.
            Use este endpoint para verificações periódicas após o login.{' '}
            <strong>Não cria clientes nem inicia trials</strong> — apenas informa o estado.
          </p>

          <Endpoint
            method="GET"
            path="/access/status?customerId={id}&productId={id}"
            description="Consulta status atual de acesso por customer + product"
          >
            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Parâmetros de query</h4>
            <PropTable rows={[
              { name: 'customerId', type: 'uuid', required: true, description: 'ID do cliente no Hub Billing' },
              { name: 'productId',  type: 'uuid', required: true, description: 'ID do produto no Hub Billing' },
            ]} />

            <CodeBlock language="http" code={`GET /api/v1/access/status?customerId=2db2626d-...&productId=a1b2c3d4-...
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Trial ativo</h4>
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "accessStatus": "trial",
  "canAccess": true,
  "trialStartedAt": "2026-03-29T10:00:00.000Z",
  "trialEndAt": "2026-04-12T10:00:00.000Z",
  "licenseEndAt": null,
  "daysLeft": 10,
  "reason": "trial_active",
  "features": { "max_users": 5, "reports": true },
  "banner": "Você está no período de avaliação gratuita. Restam 10 dias."
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Resposta — Licença em carência</h4>
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "accessStatus": "licensed",
  "canAccess": true,
  "trialStartedAt": null,
  "trialEndAt": null,
  "licenseEndAt": "2026-04-05T23:59:59.000Z",
  "daysLeft": 3,
  "reason": "grace_period",
  "features": { "max_users": 10, "export_pdf": true },
  "banner": "Seu acesso está em carência. Regularize o pagamento. Restam 3 dia(s)."
}`} />

            <h4 className="font-semibold text-xs text-gray-500 uppercase tracking-wider mt-4 mb-2">Valores possíveis para reason</h4>
            <div className="overflow-x-auto my-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tl-lg">reason</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tr-lg">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['trial_active',       'Trial em andamento'],
                    ['trial_expired',      'Trial encerrado sem conversão'],
                    ['licensed',           'Licença paga ativa'],
                    ['grace_period',       'Dentro do período de carência após vencimento'],
                    ['license_suspended',  'Suspensa por inadimplência'],
                    ['license_revoked',    'Revogada manualmente pelo admin'],
                    ['no_license',         'Nenhum vínculo encontrado'],
                    ['customer_not_found', 'Cliente não existe no Hub'],
                    ['customer_blocked',   'Cliente bloqueado'],
                    ['product_not_found',  'Produto não encontrado'],
                  ].map(([reason, desc], i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2 font-mono text-red-600 text-xs font-medium">{reason}</td>
                      <td className="px-3 py-2 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Endpoint>
        </Section>

        {/* ── REGRAS DE TRIAL ──────────────────────────────────────────────── */}
        <Section id="trial" title="Regras de Trial" icon={<Key size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            O trial é gerenciado <strong>exclusivamente pelo Hub</strong>. O sistema satélite não arbitra nem controla
            o período de avaliação — apenas exibe a resposta recebida.
          </p>

          <div className="space-y-3 mb-5">
            {[
              { title: 'Uma vez por produto', desc: 'O trial é concedido apenas uma vez por customer + product. Tentativas subsequentes retornam o estado existente sem criar novo trial.' },
              { title: 'Configurado no produto', desc: 'A duração é definida no campo trial_days do produto. 0 = sem trial. Cada produto pode ter um período diferente.' },
              { title: 'Início automático', desc: 'Iniciado automaticamente no primeiro POST /access/resolve elegível. Não requer ação manual.' },
              { title: 'Fonte única de verdade', desc: 'O Hub é o único sistema que decide se o trial está ativo, expirado ou nunca concedido.' },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Configuração por produto</h3>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tl-lg">Produto</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">trial_days</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700 rounded-tr-lg">Comportamento</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['CRM Pro',        '15', 'Inicia trial de 15 dias no primeiro acesso'],
                  ['PDV Retail',     '7',  'Inicia trial de 7 dias no primeiro acesso'],
                  ['ERP Clínico',    '30', 'Inicia trial de 30 dias no primeiro acesso'],
                  ['Sem trial',      '0',  'Retorna no_license se não houver licença paga'],
                ].map(([prod, days, behavior], i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-2 font-medium text-gray-800">{prod}</td>
                    <td className="px-3 py-2 font-mono text-purple-600">{days}</td>
                    <td className="px-3 py-2 text-gray-600">{behavior}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-semibold text-gray-900 mb-3">Fluxo de decisão do resolve</h3>
          <CodeBlock language="text" code={`POST /access/resolve
         │
         ├─ Documento inválido → blocked (sem criar nada)
         │
         ├─ Localiza ou cria cliente pelo CPF/CNPJ
         │
         ├─ Cliente bloqueado → blocked
         │
         ├─ Licença paga ativa → licensed ✓
         │
         ├─ Licença paga em carência → licensed ✓ (com banner)
         │
         ├─ Licença trial ativa → trial ✓
         │
         ├─ Trial já usado (expirado) → blocked (trial_expired)
         │
         ├─ Sem trial e produto tem trial_days > 0
         │    └─ Inicia trial → trial ✓ (banner de boas-vindas)
         │
         └─ Sem trial e trial_days = 0 → no_license`} />
        </Section>

        {/* ── CLIENTES EXTERNOS ────────────────────────────────────────────── */}
        <Section id="customers-ext" title="Clientes Externos" icon={<Code2 size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Endpoints auxiliares para verificar a existência de um cliente ou criá-lo de forma
            idempotente, sem iniciar trial ou verificar licença.
          </p>
          <Alert type="info">
            Em clientes sem CPF/CNPJ, o fluxo de criação por e-mail também é suportado.
          </Alert>

          <Endpoint
            method="GET"
            path="/access/customers/resolve?document={doc}"
            description="Verifica se um cliente existe pelo CPF/CNPJ ou e-mail"
          >
            <PropTable rows={[
              { name: 'document', type: 'string', required: false, description: 'CPF ou CNPJ (ao menos um dos dois)' },
              { name: 'email',    type: 'string', required: false, description: 'E-mail (ao menos um dos dois)' },
            ]} />
            <CodeBlock language="http" code={`GET /api/v1/access/customers/resolve?document=12345678909
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx`} />
            <CodeBlock language="json" code={`{
  "exists": true,
  "source": "existing",
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9"
}`} />
            <p className="text-sm text-gray-600 mt-2">Quando não encontrado: <code className="font-mono text-xs bg-gray-100 px-1 rounded">{`{"exists": false, "source": "existing", "customerId": null}`}</code></p>
          </Endpoint>

          <Endpoint
            method="POST"
            path="/access/customers/upsert"
            description="Cria cliente de forma idempotente (não duplica por documento)"
          >
            <PropTable rows={[
              { name: 'personType',      type: '"PF"|"PJ"', required: true,  description: 'Tipo de pessoa' },
              { name: 'document',        type: 'string',    required: false, description: 'CPF ou CNPJ (opcional quando e-mail for informado)' },
              { name: 'legalName',       type: 'string',    required: true,  description: 'Nome ou Razão Social' },
              { name: 'email',           type: 'string',    required: true,  description: 'E-mail' },
              { name: 'phone',           type: 'string',    required: false, description: 'Telefone' },
              { name: 'addressZip',      type: 'string',    required: false, description: 'CEP' },
              { name: 'addressStreet',   type: 'string',    required: false, description: 'Logradouro' },
              { name: 'addressNumber',   type: 'string',    required: false, description: 'Número' },
              { name: 'addressDistrict', type: 'string',    required: false, description: 'Bairro' },
              { name: 'addressCity',     type: 'string',    required: false, description: 'Cidade' },
              { name: 'addressState',    type: 'string',    required: false, description: 'UF (2 letras)' },
            ]} />
            <CodeBlock language="json" code={`{
  "personType": "PJ",
  "document": "12.345.678/0001-90",
  "legalName": "Empresa Exemplo LTDA",
  "email": "financeiro@empresa.com.br",
  "phone": "(11) 99999-9999",
  "addressZip": "60000-000",
  "addressCity": "Fortaleza",
  "addressState": "CE"
}`} />
            <CodeBlock language="json" code={`{
  "personType": "PF",
  "legalName": "Cliente Internacional",
  "email": "cliente.sem.documento@exemplo.com"
}`} />
            <CodeBlock language="json" code={`// Criado com sucesso
{ "exists": true, "source": "created", "customerId": "uuid..." }

// Já existia (idempotente)
{ "exists": true, "source": "existing", "customerId": "uuid..." }`} />
          </Endpoint>
        </Section>

        {/* ── VERIFICAR ACESSO (legado) ─────────────────────────────────────── */}
        <Section id="access" title="Validação Legada (por productCode)" icon={<ShieldCheck size={16} />}>
          <Alert type="warning">
            Endpoint mantido para retrocompatibilidade. Para novos sistemas, use{' '}
            <strong>POST /access/resolve</strong> que suporta trial, onboarding e controle centralizado.
          </Alert>
          <p className="text-sm text-gray-600 mt-4 mb-4">
            Valida acesso informando o ID do cliente e o código do produto.
            Não inicia trial nem cria clientes.
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

        <Section id="plans-catalog" title="Catálogo de Planos" icon={<Package size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Use os endpoints abaixo para montar a vitrine de planos no satélite com dados oficiais do Hub
            (sem fallback local para nome/preço/status).
          </p>

          <Alert type="info">
            <strong>Multi-plataforma:</strong> o contrato é por <code className="font-mono text-xs">productId</code>.
            Cada satélite deve usar sua própria API Key vinculada ao produto correto e sempre ler catálogo no Hub.
          </Alert>

          <Endpoint
            method="GET"
            path="/products/{productId}/plans"
            description="Catálogo completo de planos do produto (JWT admin)"
          >
            <CodeBlock language="http" code={`GET /api/v1/products/{productId}/plans?includeArchived=true
Authorization: Bearer <accessToken>`} />
            <PropTable rows={[
              { name: 'status', type: `'active' | 'archived' | 'draft'`, required: false, description: 'Filtra pelo status do plano' },
              { name: 'includeArchived', type: 'boolean', required: false, description: 'Inclui planos arquivados (padrão: true)' },
            ]} />
          </Endpoint>

          <Endpoint
            method="GET"
            path="/access/products/{productId}/plans"
            description="Catálogo público para satélite (API Key)"
          >
            <CodeBlock language="http" code={`GET /api/v1/access/products/{productId}/plans?includeArchived=false
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx`} />
            <PropTable rows={[
              { name: 'status', type: `'active' | 'archived' | 'draft'`, required: false, description: 'Filtra pelo status do plano' },
              { name: 'includeArchived', type: 'boolean', required: false, description: 'Inclui planos arquivados (padrão: false)' },
            ]} />
          </Endpoint>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Contrato por item de plano</h3>
          <CodeBlock language="json" code={`{
  "id": "uuid",
  "productId": "uuid",
  "code": "TESTE",
  "name": "Plano Teste",
  "description": "Teste por 14 dias...",
  "amount": 100,
  "currency": "BRL",
  "intervalUnit": "month",
  "intervalCount": 1,
  "status": "active",
  "isActive": true,
  "createdAt": "2026-04-01T00:00:00.000Z",
  "updatedAt": "2026-04-01T00:00:00.000Z"
}`} />

          <Alert type="info">
            <strong>Contrato estável:</strong> <code className="font-mono text-xs">amount</code> é sempre em centavos,
            <code className="font-mono text-xs"> status</code> é normalizado para <code className="font-mono text-xs">active|archived|draft</code>,
            e <code className="font-mono text-xs">isActive</code> reflete <code className="font-mono text-xs">status === "active"</code>.
          </Alert>

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Go-live para novos satélites</h3>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Cadastrar produto e planos no Hub.</li>
            <li>Gerar API Key da integração para o produto.</li>
            <li>Consumir <code className="font-mono text-xs">/access/resolve</code>, <code className="font-mono text-xs">/access/status</code> e <code className="font-mono text-xs">/access/products/{'{productId}'}/plans</code>.</li>
            <li>Validar checkout e webhooks antes de publicar em produção.</li>
          </ol>
        </Section>

        <Section id="payments" title="Processamento de Pagamentos" icon={<ExternalLink size={16} />}>
          <p className="text-sm text-gray-600 mb-4">
            Fluxo recomendado para sistemas externos que precisam processar cobrança:
            <strong> criar pedido/assinatura → gerar checkout → acompanhar status da cobrança → receber confirmação via webhook</strong>.
          </p>

          <Alert type="info">
            Conversão de trial para pago: se já existir assinatura em trial/ativa, use <code className="font-mono text-xs">PATCH /subscriptions/{'{subscriptionId}'}/change-plan</code> e depois <code className="font-mono text-xs">POST /subscriptions/{'{subscriptionId}'}/checkout</code>. Se o trial veio apenas do <code className="font-mono text-xs">/access/resolve</code>, use <code className="font-mono text-xs">POST /orders</code> + <code className="font-mono text-xs">POST /orders/{'{orderId}'}/checkout</code>.
          </Alert>
          <Alert type="warning">
            Regra vigente para PIX: o titular precisa ter nome e CPF/CNPJ válido.
            Se o cliente não tiver documento válido salvo, envie <code className="font-mono text-xs">payerName</code> e <code className="font-mono text-xs">payerDocument</code> no checkout.
          </Alert>
          <Alert type="info">
            Quando <code className="font-mono text-xs">payerDocument</code> é enviado e o checkout PIX é criado com sucesso, o Hub tenta persistir o documento no cliente para reutilizar nas próximas cobranças.
          </Alert>

          <Endpoint
            method="POST"
            path="/orders"
            description="Cria pedido avulso para cobrança one-time (inclui conversão de trial sem assinatura)"
          >
            <PropTable rows={[
              { name: 'customerId', type: 'uuid', required: true, description: 'ID do cliente no Hub Billing' },
              { name: 'productId', type: 'uuid', required: true, description: 'ID do produto' },
              { name: 'planId', type: 'uuid', required: false, description: 'ID do plano contratado (recomendado)' },
              { name: 'contractedAmount', type: 'number', required: false, description: 'Valor em centavos (ex: 9900 = R$ 99,00)' },
              { name: 'amount', type: 'number', required: false, description: 'Alias de compatibilidade. Se decimal, é convertido para centavos' },
            ]} />
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "contractedAmount": 9900
}`} />
            <CodeBlock language="json" code={`{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "amount": 99.9
}`} />
          </Endpoint>

          <Endpoint
            method="PATCH"
            path="/subscriptions/{subscriptionId}/change-plan"
            description="Upgrade/downgrade da assinatura existente (trialing/active/overdue)"
          >
            <PropTable rows={[
              { name: 'planId', type: 'uuid', required: true, description: 'Novo plano da assinatura' },
              { name: 'amount', type: 'number', required: true, description: 'Novo valor contratado em centavos' },
            ]} />
            <CodeBlock language="json" code={`{
  "planId": "uuid-do-novo-plano",
  "amount": 14990
}`} />
          </Endpoint>

          <Endpoint
            method="POST"
            path="/orders/{orderId}/checkout ou /subscriptions/{subscriptionId}/checkout"
            description="Gera cobrança PIX ou cartão para pedido/assinatura"
          >
            <PropTable rows={[
              { name: 'billingType', type: `'PIX' | 'CREDIT_CARD'`, required: true, description: 'Método de pagamento' },
              { name: 'installmentCount', type: 'number', required: false, description: 'Parcelas (cartão)' },
              { name: 'payerName', type: 'string', required: false, description: 'Nome do titular (obrigatório para PIX quando faltar no cadastro)' },
              { name: 'payerDocument', type: 'string', required: false, description: 'CPF/CNPJ do titular (obrigatório para PIX quando faltar no cadastro)' },
            ]} />
            <CodeBlock language="json" code={`{
  "billingType": "PIX",
  "payerName": "Maria Oliveira",
  "payerDocument": "12345678909"
}`} />
            <CodeBlock language="json" code={`{
  "chargeId": "uuid-local-da-cobranca",
  "externalChargeId": "151589827825",
  "status": "pending",
  "checkoutUrl": null,
  "pixCode": "00020126...",
  "pixQrCode": "data:image/png;base64,...",
  "pixPayload": "00020126...",
  "boletoUrl": null,
  "amount": 9900,
  "currency": "BRL",
  "dueDate": "2026-03-31"
}`} />
            <CodeBlock language="json" code={`{
  "code": "PAYER_DOCUMENT_REQUIRED",
  "message": "CPF/CNPJ válido do titular é obrigatório para gerar cobrança PIX.",
  "details": [
    "Informe payerDocument no checkout (11 dígitos para CPF ou 14 para CNPJ).",
    "Onboarding por e-mail continua suportado em /access/resolve para acesso/trial."
  ],
  "statusCode": 422
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
    "status": "paid",
    "amount": 9900
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
            Quando <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">canAccess: false</code>,
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
                  ['customer_not_found', 'Cliente não existe no Hub', 'Verificar document/customerId enviado'],
                  ['customer_blocked',   'Cliente está bloqueado', 'Exibir mensagem de conta suspensa'],
                  ['product_not_found',  'productId/productCode inválido', 'Verificar o ID ou código do produto'],
                  ['trial_active',       'Trial em andamento (canAccess: true)', 'Exibir banner de trial'],
                  ['trial_expired',      'Trial expirado sem conversão', 'Redirecionar para tela de compra/planos'],
                  ['no_license',         'Sem trial configurado e sem licença', 'Contato comercial ou tela de planos'],
                  ['licensed',           'Licença paga ativa (canAccess: true)', 'Liberar acesso completo'],
                  ['license_suspended',  'Licença suspensa por inadimplência', 'Exibir aviso de pagamento pendente'],
                  ['license_expired',    'Licença expirada após carência', 'Direcionar para renovação'],
                  ['license_revoked',    'Licença revogada manualmente', 'Contatar suporte'],
                  ['license_inactive',   'Licença inativa (não iniciada)', 'Aguardar ativação'],
                  ['grace_period',       'Em período de carência (canAccess: true)', 'Exibir aviso de renovação urgente'],
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
            { name: '200', type: 'OK',          description: 'Requisição processada. Verifique canAccess/accessStatus.' },
            { name: '401', type: 'Unauthorized', description: 'API Key ausente, inválida ou revogada.' },
            { name: '403', type: 'Forbidden',    description: 'Token JWT sem permissão para o endpoint administrativo.' },
            { name: '404', type: 'Not Found', description: 'Recurso não encontrado (pedido, assinatura, cliente, produto).' },
            { name: '429', type: 'Too Many Requests', description: 'Rate limit atingido. Aguarde e tente novamente.' },
            { name: '422', type: 'Unprocessable', description: 'UUID inválido, documento inválido ou payload malformado.' },
            { name: '500', type: 'Server Error', description: 'Erro interno. Tente novamente em alguns segundos.' },
          ]} />

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Payload padrão de erro</h3>
          <CodeBlock language="json" code={`{
  "code": "VALIDATION_ERROR",
  "message": "document must be longer than or equal to 11 characters",
  "details": ["document must be longer than or equal to 11 characters"],
  "correlationId": "2aa7bf04-f8c9-43c7-bf6f-efde44f56a22",
  "timestamp": "2026-03-30T22:00:00.000Z",
  "path": "/api/v1/access/resolve",
  "statusCode": 422
}`} />
        </Section>

        {/* ── EXEMPLOS DE CÓDIGO ───────────────────────────────────────────── */}
        <Section id="examples" title="Exemplos de Código" icon={<Code2 size={16} />}>

          <h3 className="font-semibold text-gray-900 mb-3">Node.js / TypeScript — Fluxo completo de login</h3>
          <CodeBlock language="typescript" code={`// hubBillingClient.ts
const BASE_URL = process.env.HUB_BILLING_BASE_URL!
const API_KEY  = process.env.HUB_BILLING_API_KEY!
const PRODUCT_ID = process.env.HUB_PRODUCT_ID!

interface ResolveResult {
  customerId: string
  productId: string
  licenseId: string | null
  accessStatus: 'trial' | 'licensed' | 'blocked' | 'no_license'
  trialStartedAt: string | null
  trialEndAt: string | null
  licenseEndAt: string | null
  daysLeft: number | null
  reason: string
  features: Record<string, unknown> | null
  canAccess: boolean
  banner: string | null
}

// Usar no login — onboarding + decisão de acesso
export async function resolveAccess(
  document: string,
  personType: 'PF' | 'PJ',
  name: string,
  email: string
): Promise<ResolveResult> {
  const res = await fetch(\`\${BASE_URL}/access/resolve\`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, personType, productId: PRODUCT_ID, name, email }),
  })
  if (res.status === 401) throw new Error('API Key inválida')
  if (!res.ok) throw new Error(\`Hub Billing error: \${res.status}\`)
  return res.json()
}

// Usar para consultas periódicas (sem onboarding)
export async function getAccessStatus(
  customerId: string
): Promise<{
  customerId: string
  productId: string
  licenseId: string | null
  accessStatus: string
  trialStartedAt: string | null
  trialEndAt: string | null
  licenseEndAt: string | null
  daysLeft: number | null
  reason: string
  features: Record<string, unknown> | null
  canAccess: boolean
  banner: string | null
}> {
  const res = await fetch(
    \`\${BASE_URL}/access/status?customerId=\${customerId}&productId=\${PRODUCT_ID}\`,
    { headers: { 'X-API-Key': API_KEY } }
  )
  return res.json()
}

// Uso no login:
const access = await resolveAccess(user.document, 'PF', user.name, user.email)

if (!access.canAccess) {
  return redirect(\`/planos?reason=\${access.accessStatus}\`)
}

// Armazena na sessão
session.hubCustomerId = access.customerId
session.accessStatus  = access.accessStatus
if (access.banner) showBanner(access.banner)`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">Python</h3>
          <CodeBlock language="python" code={`# hub_billing.py
import os, requests

BASE_URL   = os.environ["HUB_BILLING_BASE_URL"]
API_KEY    = os.environ["HUB_BILLING_API_KEY"]
PRODUCT_ID = os.environ["HUB_PRODUCT_ID"]

session = requests.Session()
session.headers.update({"X-API-Key": API_KEY, "Content-Type": "application/json"})

def resolve_access(document: str, person_type: str, name: str, email: str) -> dict:
    """Onboarding + decisão de acesso. Usar no login."""
    response = session.post(f"{BASE_URL}/access/resolve", json={
        "document": document,
        "personType": person_type,
        "productId": PRODUCT_ID,
        "name": name,
        "email": email,
    }, timeout=5)
    response.raise_for_status()
    return response.json()

def get_access_status(customer_id: str) -> dict:
    """Consulta periódica de status. Não inicia trial."""
    response = session.get(
        f"{BASE_URL}/access/status",
        params={"customerId": customer_id, "productId": PRODUCT_ID},
        timeout=5,
    )
    response.raise_for_status()
    return response.json()

# Uso no login:
result = resolve_access("123.456.789-09", "PF", "Maria", "maria@ex.com")
if not result["canAccess"]:
    raise PermissionError(f"Acesso negado: {result['accessStatus']}")

customer_id = result["customerId"]
if result["banner"]:
    show_banner(result["banner"])`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">PHP</h3>
          <CodeBlock language="php" code={`<?php
// HubBillingClient.php
class HubBillingClient {
    private string $baseUrl;
    private string $apiKey;
    private string $productId;

    public function __construct() {
        $this->baseUrl   = $_ENV['HUB_BILLING_BASE_URL'];
        $this->apiKey    = $_ENV['HUB_BILLING_API_KEY'];
        $this->productId = $_ENV['HUB_PRODUCT_ID'];
    }

    public function resolveAccess(string $document, string $personType, string $name, string $email): array {
        $payload = json_encode([
            'document'   => $document,
            'personType' => $personType,
            'productId'  => $this->productId,
            'name'       => $name,
            'email'      => $email,
        ]);
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "X-API-Key: {$this->apiKey}\r\nContent-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 5,
        ]]);
        $body = file_get_contents("{$this->baseUrl}/access/resolve", false, $ctx);
        if ($body === false) throw new RuntimeException('Hub Billing unreachable');
        return json_decode($body, true);
    }
}

// Uso no login:
$hub    = new HubBillingClient();
$access = $hub->resolveAccess($user['document'], 'PF', $user['name'], $user['email']);

if (!$access['canAccess']) {
    http_response_code(403);
    die(json_encode(['error' => $access['accessStatus'], 'banner' => $access['banner']]));
}

// Salva na sessão
$_SESSION['hub_customer_id'] = $access['customerId'];
$_SESSION['access_status']   = $access['accessStatus'];`} />

          <h3 className="font-semibold text-gray-900 mt-6 mb-3">cURL (linha de comando)</h3>
          <CodeBlock language="bash" code={`# Resolve acesso (login/onboarding)
curl -s -X POST \\
  -H "X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{"document":"123.456.789-09","personType":"PF","productId":"UUID_PRODUTO","name":"Maria","email":"maria@ex.com"}' \\
  "https://billing.seudominio.com/api/v1/access/resolve" | jq .

# Consultar status periodicamente
curl -s \\
  -H "X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx" \\
  "https://billing.seudominio.com/api/v1/access/status?customerId=UUID_CLIENTE&productId=UUID_PRODUTO" \\
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
async function checkAccessCached(customerId, productId, redis) {
  const cacheKey = \`access-status:\${customerId}:\${productId}\`

  // Tenta cache primeiro (TTL 60s)
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const result = await getAccessStatus(customerId)

  // Não cacheia negações por muito tempo (pode ter renovado)
  const ttl = result.canAccess ? 60 : 10
  await redis.setex(cacheKey, ttl, JSON.stringify(result))

  return result
}`} />

          <h3 className="font-semibold text-gray-900 mt-5 mb-3">Checklist de integração</h3>
          <div className="space-y-2">
            {[
              'Gere uma API Key exclusiva por sistema/ambiente (não reutilize entre produção e dev)',
              'Armazene API Key e productId em variáveis de ambiente, nunca no código-fonte',
              'Use POST /access/resolve no login — é idempotente e trata onboarding completo',
              'Use GET /access/status para refreshes periódicos (não use resolve novamente)',
              'Exiba o campo banner quando não nulo — a mensagem já está pronta para o usuário',
              'Implemente tela de conversão para canAccess: false com accessStatus como contexto',
              'Implemente tratamento de erro para status 401, 422 e 5xx',
              'Configure trial_days no produto antes de ativar integrações',
              'Use cache de 30–60s para reduzir requisições em alta volumetria',
              'Configure webhook para invalidar cache automaticamente quando a licença mudar',
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
