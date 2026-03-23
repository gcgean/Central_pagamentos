# Guia de Integração — Sistemas Satélites

Este guia explica como qualquer sistema satélite deve se conectar ao Hub Central.
A integração é deliberadamente simples: o satélite só precisa consumir a API do hub.

---

## Conceito

```
Sistema Satélite                    Hub Central
──────────────────                  ──────────────
Login do usuário
  └─ identifica o cliente
      └─ GET /access/validate  ──▶  consulta licença
                               ◀──  { allowed, features }
  └─ libera ou bloqueia acesso
```

O satélite **nunca** fala diretamente com o gateway de pagamento.
Toda a lógica financeira fica no hub.

---

## Configuração inicial

### 1. Solicitar API Key

No painel administrativo do hub:

```
POST /api/v1/integrations/api-keys
{
  "productId": "<uuid-do-seu-produto>",
  "name": "Produção — Sistema Clínico"
}
```

Resposta (guarde a `apiKey` — ela só aparece uma vez):
```json
{
  "apiKey": "hub_live_a1b2c3d4e5f6...",
  "integration": { "id": "...", "name": "Produção — Sistema Clínico" }
}
```

### 2. Configurar no sistema satélite

```env
HUB_API_URL=https://seu-hub.com/api/v1
HUB_API_KEY=hub_live_a1b2c3d4e5f6...
HUB_PRODUCT_CODE=erp_clinico
HUB_WEBHOOK_SECRET=seu-secret-para-validar-eventos
```

---

## Validação de acesso (o mais importante)

Chame este endpoint sempre que um cliente tentar acessar o sistema:

```
GET /api/v1/access/customer/{customerId}/product/{productCode}
x-api-key: hub_live_...
```

### Resposta: acesso liberado

```json
{
  "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "productCode": "erp_clinico",
  "allowed": true,
  "licenseStatus": "active",
  "planCode": "clinico_pro",
  "expiresAt": "2026-06-01T23:59:59Z",
  "features": {
    "max_users": 10,
    "reports": true,
    "api": true
  },
  "checkedAt": "2026-03-22T14:00:00Z"
}
```

### Resposta: acesso negado

```json
{
  "customerId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "productCode": "erp_clinico",
  "allowed": false,
  "reason": "license_suspended",
  "checkedAt": "2026-03-22T14:00:00Z"
}
```

### Valores de `reason`

| Valor | Significado | Ação recomendada |
|---|---|---|
| `customer_not_found` | Cliente inexistente no hub | Verificar cadastro |
| `customer_blocked` | Cliente bloqueado | Contatar suporte |
| `product_not_found` | Produto não cadastrado | Verificar configuração |
| `no_license` | Cliente nunca comprou | Redirecionar para checkout |
| `license_inactive` | Licença inativa | Redirecionar para checkout |
| `license_suspended` | Inadimplência sem carência | Exibir aviso de pagamento |
| `grace_period` | Em carência (ainda permite) | Exibir aviso suave |
| `license_expired` | Licença expirada | Redirecionar para renovação |
| `license_revoked` | Revogada pelo suporte | Contatar suporte |

---

## Exemplo de implementação (Node.js)

```typescript
// hub-client.ts
import axios from 'axios'

const hub = axios.create({
  baseURL: process.env.HUB_API_URL,
  headers: { 'x-api-key': process.env.HUB_API_KEY },
  timeout: 5000,
})

export interface AccessResult {
  allowed: boolean
  reason?: string
  licenseStatus?: string
  planCode?: string
  expiresAt?: string | null
  features?: Record<string, any>
}

export async function validateAccess(
  customerId: string,
  productCode = process.env.HUB_PRODUCT_CODE,
): Promise<AccessResult> {
  try {
    const { data } = await hub.get(
      `/access/customer/${customerId}/product/${productCode}`
    )
    return data
  } catch (err) {
    // Em caso de erro na comunicação com o hub, decisão de negócio:
    // fail-open (permitir) ou fail-close (bloquear)
    // Recomendado: fail-open com cache local para alta disponibilidade
    console.error('Erro ao validar acesso no hub:', err.message)
    return { allowed: false, reason: 'hub_unavailable' }
  }
}

// middleware de autenticação no sistema satélite
export async function requireLicense(req: any, res: any, next: any) {
  const customerId = req.session?.customerId
  if (!customerId) return res.redirect('/login')

  const access = await validateAccess(customerId)

  if (!access.allowed) {
    if (access.reason === 'no_license' || access.reason === 'license_inactive') {
      return res.redirect('/checkout')
    }
    if (access.reason === 'license_suspended') {
      return res.redirect('/pagamento-pendente')
    }
    return res.redirect('/acesso-negado')
  }

  // Injeta features na request para uso nos controllers
  req.license = {
    planCode:   access.planCode,
    expiresAt:  access.expiresAt,
    features:   access.features,
    maxUsers:   access.features?.max_users,
  }

  // Avisa sobre carência sem bloquear
  if (access.reason === 'grace_period') {
    req.licenseWarning = 'Seu acesso está em período de carência. Regularize o pagamento.'
  }

  next()
}
```

---

## Carregar todos os produtos de um cliente de uma vez

Para evitar múltiplos requests, use o endpoint de entitlements:

```
GET /api/v1/access/entitlements/{customerId}
x-api-key: hub_live_...
```

```json
{
  "customerId": "3fa85f64...",
  "checkedAt": "2026-03-22T14:00:00Z",
  "products": [
    {
      "productId": "...",
      "productCode": "erp_clinico",
      "licenseId": "...",
      "allowed": true,
      "licenseStatus": "active",
      "expiresAt": "2026-06-01T23:59:59Z",
      "features": { "max_users": 10, "reports": true }
    },
    {
      "productId": "...",
      "productCode": "pdv_retail",
      "licenseId": "...",
      "allowed": false,
      "licenseStatus": "suspended"
    }
  ]
}
```

---

## Receber eventos do hub (webhooks internos)

Configure a URL de webhook no cadastro do produto no admin.
O hub enviará um POST para essa URL quando eventos relevantes ocorrerem.

### Configurar endpoint no satélite

```typescript
// webhook-receiver.ts
import { createHmac, timingSafeEqual } from 'crypto'

// Valida a assinatura HMAC enviada pelo hub
function validateHubSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signature.replace('sha256=', '')
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}

app.post('/webhooks/hub', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-hub-signature'] as string

  if (!validateHubSignature(req.body, signature, process.env.HUB_WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Assinatura inválida' })
  }

  const event = JSON.parse(req.body.toString())

  // Responde imediatamente para evitar timeout
  res.status(200).json({ received: true })

  // Processa de forma assíncrona
  await processHubEvent(event)
})

async function processHubEvent(event: any) {
  const { type, customerId, productId, payload } = event

  switch (type) {
    case 'license.activated':
      // Provisionamento: criar tenant, usuário admin, etc.
      await provisionCustomer(customerId, payload)
      break

    case 'license.renewed':
      // Renovação: atualizar data de expiração no banco local
      await updateLicenseExpiry(customerId, payload.expiresAt)
      break

    case 'license.suspended':
      // Suspensão: bloquear login, notificar usuários
      await suspendCustomerAccess(customerId, payload.reason)
      break

    case 'license.reactivated':
      // Reativação: liberar acesso novamente
      await reactivateCustomerAccess(customerId)
      break

    case 'license.revoked':
      // Revogação definitiva
      await revokeCustomerAccess(customerId, payload.reason)
      break
  }
}
```

### Eventos disponíveis

| Evento | Quando dispara |
|---|---|
| `license.activated` | Pagamento confirmado, licença emitida |
| `license.renewed` | Renovação mensal/anual confirmada |
| `license.suspended` | Inadimplência após carência |
| `license.reactivated` | Pagamento regularizado |
| `license.revoked` | Ação administrativa definitiva |

---

## Cache para alta disponibilidade

Para evitar que o hub ser a SPOF do seu sistema, implemente cache local:

```typescript
// cache de 5 minutos — se o hub estiver fora, aceita o cache
const ACCESS_CACHE_TTL = 5 * 60 * 1000

const cache = new Map<string, { result: AccessResult; expiresAt: number }>()

export async function validateAccessCached(customerId: string): Promise<AccessResult> {
  const cacheKey = `${customerId}:${process.env.HUB_PRODUCT_CODE}`
  const cached = cache.get(cacheKey)

  if (cached && Date.now() < cached.expiresAt) {
    return cached.result
  }

  const result = await validateAccess(customerId)

  cache.set(cacheKey, {
    result,
    expiresAt: Date.now() + ACCESS_CACHE_TTL,
  })

  return result
}
```

---

## Buscar ou criar checkout

Quando `allowed: false` e o cliente precisa comprar:

```
POST /api/v1/orders
Authorization: Bearer <admin-token>

{
  "customerId": "3fa85f64...",
  "productId":  "10000000...",
  "planId":     "20000000...",
  "contractedAmount": 19900
}
```

```
POST /api/v1/orders/{orderId}/checkout
{
  "billingType": "PIX"
}
```

Resposta:
```json
{
  "chargeId": "...",
  "checkoutUrl": "https://sandbox.asaas.com/i/...",
  "pixPayload": "00020126...",
  "pixQrCode": "data:image/png;base64,...",
  "amount": 19900,
  "dueDate": "2026-03-25"
}
```

---

## Verificação de saúde

```
GET /api/health
```

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis":    { "status": "up" }
  }
}
```
