# Guia de Integração — Sistemas Satélites

Este documento descreve o padrão oficial para integrar sistemas externos ao Hub Billing com foco em:
- resolução centralizada de acesso e onboarding de clientes
- validação de licença em runtime
- geração de cobrança
- acompanhamento de status de pagamento
- recebimento de confirmações por webhook

## Visão geral de arquitetura

```text
Sistema Satélite  ->  Hub Billing API  ->  Gateway (Mercado Pago / Asaas)
                         |
                         ->  Webhook de saída (Hub -> Satélite)
```

O sistema satélite **não implementa regra de billing**. Ele apenas:
1. Envia dados do usuário via `POST /access/resolve`
2. Consulta status de acesso periodicamente via `GET /access/status`
3. Libera ou bloqueia funcionalidades com base na resposta do Hub
4. Exibe banners e mensagens usando o campo `banner` retornado

## Base URL

```text
https://seu-dominio.com/api/v1
```

## Autenticação

### 1) API Key (integração de acesso — runtime do satélite)

Use em todos os endpoints do módulo `access`:

```http
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

### 2) JWT Admin (operações financeiras e de gestão)

Use em endpoints de criação de pedidos, checkout e consulta de cobranças:

```http
Authorization: Bearer <accessToken>
```

Login para obter token:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "admin@exemplo.com.br",
  "password": "SUA_SENHA_FORTE"
}
```

---

## Fluxo recomendado de integração

```
1. Login do usuário no satélite
         |
         v
2. POST /access/resolve  ← único ponto de entrada
         |
         +-- canAccess: true  → libera o sistema
         |        |
         |        +-- accessStatus: trial    → exibe banner de trial
         |        +-- accessStatus: licensed → acesso sem restrição
         |
         +-- canAccess: false → bloqueia o sistema
                  |
                  +-- accessStatus: blocked   → tela de conversão
                  +-- accessStatus: no_license → contato comercial
```

Para consultas subsequentes (sem onboarding):

```
GET /access/status?customerId=xxx&productId=yyy
```

---

## Endpoints de acesso (API Key)

### POST /access/resolve — Resolução centralizada de acesso

Endpoint principal para onboarding. Localiza ou cria o cliente pelo CPF/CNPJ, verifica licença e trial, e retorna a decisão de acesso.

**Garantias:**
- Cliente único por CPF/CNPJ — sem duplicação por produto
- Trial concedido apenas uma vez por customer + product
- Idempotente: chamadas repetidas com mesmo documento retornam o mesmo estado

```http
POST /api/v1/access/resolve
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
Content-Type: application/json

{
  "document": "123.456.789-09",
  "personType": "PF",
  "productId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Maria Oliveira",
  "email": "maria@exemplo.com.br"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `document` | string | ✓ | CPF ou CNPJ (formatado ou apenas dígitos) |
| `personType` | `PF` \| `PJ` | ✓ | Tipo de pessoa |
| `productId` | UUID | ✓ | ID do produto no Hub |
| `name` | string | ✓ | Nome completo ou Razão Social |
| `email` | string | ✓ | E-mail do cliente |

**Resposta — trial iniciado:**

```json
{
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
}
```

**Resposta — licença paga ativa:**

```json
{
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
}
```

**Resposta — trial expirado (bloqueado):**

```json
{
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
}
```

**Valores possíveis para `accessStatus`:**

| Valor | `canAccess` | Descrição |
|---|---|---|
| `trial` | `true` | Em período de avaliação gratuita |
| `licensed` | `true` | Licença paga ativa (ou em carência) |
| `blocked` | `false` | Trial expirado, suspensão ou bloqueio |
| `no_license` | `false` | Sem trial configurado e sem licença |

---

### GET /access/status — Consulta de status de acesso

Consulta periódica do estado atual de acesso. **Não cria clientes nem inicia trials.**

```http
GET /api/v1/access/status?customerId=2db2626d-...&productId=a1b2c3d4-...
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

| Parâmetro | Tipo | Obrigatório |
|---|---|---|
| `customerId` | UUID | ✓ |
| `productId` | UUID | ✓ |

**Resposta:**

```json
{
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
}
```

**Valores possíveis para `reason`:**

| Reason | Descrição |
|---|---|
| `trial_active` | Trial em andamento |
| `trial_expired` | Trial encerrado sem conversão |
| `licensed` | Licença paga ativa |
| `grace_period` | Dentro do período de carência |
| `license_suspended` | Suspensa por inadimplência |
| `license_expired` | Vencida após carência |
| `license_revoked` | Revogada manualmente |
| `no_license` | Nenhum vínculo encontrado |
| `customer_not_found` | Cliente não existe no Hub |
| `customer_blocked` | Cliente bloqueado |
| `product_not_found` | Produto não encontrado |

---

### GET /access/customer/{customerId}/product/{productCode} — Validação legada

Endpoint original para validação de acesso via código do produto. Mantido para retrocompatibilidade.

```http
GET /api/v1/access/customer/{customerId}/product/{productCode}
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

Resposta de sucesso:

```json
{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productCode": "SOFTX_PRO",
  "allowed": true,
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "licenseStatus": "active",
  "planCode": "PRO_MENSAL",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "features": {
    "max_users": 10,
    "export_pdf": true
  },
  "checkedAt": "2026-03-29T10:00:00.000Z"
}
```

Resposta negada:

```json
{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productCode": "SOFTX_PRO",
  "allowed": false,
  "reason": "license_suspended",
  "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
  "checkedAt": "2026-03-29T10:00:00.000Z"
}
```

---

### GET /access/entitlements/{customerId} — Todos os produtos do cliente

```http
GET /api/v1/access/entitlements/{customerId}
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

Resposta:

```json
{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "checkedAt": "2026-03-29T10:00:00.000Z",
  "products": [
    {
      "productId": "111aaa22-bb33-cc44-dd55-ee6677889900",
      "productCode": "SOFTX_PRO",
      "licenseId": "f0e1d2c3-b4a5-6789-cdef-012345678901",
      "allowed": true,
      "licenseStatus": "active",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "features": { "max_users": 10 }
    }
  ]
}
```

---

### GET /access/customers/resolve — Verificar existência de cliente

```http
GET /api/v1/access/customers/resolve?document=12345678909
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

Resposta:

```json
{
  "exists": true,
  "source": "existing",
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9"
}
```

### POST /access/customers/upsert — Criar cliente idempotente

```http
POST /api/v1/access/customers/upsert
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
Idempotency-Key: erp-req-001
Content-Type: application/json

{
  "personType": "PJ",
  "document": "12.345.678/0001-90",
  "legalName": "Empresa Exemplo LTDA",
  "email": "financeiro@empresa.com.br",
  "phone": "(11) 99999-9999",
  "addressZip": "60000-000",
  "addressStreet": "Rua Central",
  "addressNumber": "100",
  "addressDistrict": "Centro",
  "addressCity": "Fortaleza",
  "addressState": "CE"
}
```

Resposta:

```json
{
  "exists": true,
  "source": "created",
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9"
}
```

---

## Regras de Trial

O trial é gerenciado **exclusivamente pelo Hub**. O sistema satélite não controla nem arbitra o trial.

- Duração configurada em `trial_days` no cadastro do produto
- Trial concedido **apenas uma vez** por customer + product
- Iniciado automaticamente no primeiro `POST /access/resolve` elegível
- Após expiração, o campo `accessStatus` retorna `blocked` com `reason: trial_expired`
- Se `trial_days = 0` no produto, não há período de avaliação gratuita

**Exemplo de configuração de produtos:**

| Produto | `trial_days` |
|---|---|
| CRM Pro | 15 dias |
| PDV Retail | 7 dias |
| ERP Clínico | 30 dias |
| Produto sem trial | 0 |

---

## Endpoints financeiros (JWT Admin)

### Conversão de trial para plano pago (fluxo oficial)

Existem dois cenários oficiais:

1. **Trial com assinatura já existente (`status=trialing`)**
- `PATCH /api/v1/subscriptions/{subscriptionId}/change-plan`
- `POST /api/v1/subscriptions/{subscriptionId}/checkout`

2. **Trial sem assinatura (trial vindo de `/access/resolve`)**
- `POST /api/v1/orders`
- `POST /api/v1/orders/{orderId}/checkout`

### Criar pedido

```http
POST /api/v1/orders
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "contractedAmount": 9900
}
```

Payload alternativo aceito por compatibilidade:

```json
{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "amount": 99.9
}
```

- `contractedAmount`: valor em centavos (inteiro).
- `amount`: alias de compatibilidade. Se decimal, o Hub converte para centavos.

### Gerar checkout do pedido

```http
POST /api/v1/orders/{orderId}/checkout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "billingType": "PIX"
}
```

Exemplo cartão:

```json
{
  "billingType": "CREDIT_CARD",
  "installmentCount": 1,
  "creditCard": {
    "token": "TOKEN_CARTAO",
    "paymentMethodId": "master",
    "issuerId": "24"
  }
}
```

Resposta:

```json
{
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
  "dueDate": "2026-04-01"
}
```

### Upgrade de assinatura existente (trialing/active/overdue)

```http
PATCH /api/v1/subscriptions/{subscriptionId}/change-plan
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "planId": "uuid-novo-plano",
  "amount": 14990
}
```

Em seguida, gere a cobrança:

```http
POST /api/v1/subscriptions/{subscriptionId}/checkout
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "billingType": "PIX"
}
```

Resposta de checkout (campos principais para integração):
- `chargeId`
- `status`
- `checkoutUrl` (quando aplicável)
- `pixCode` (quando PIX)
- `amount`

### Consultar cobranças por origem

```http
GET /api/v1/payments/charges?originType=order&originId={orderId}
Authorization: Bearer <accessToken>
```

---

## Webhook de saída (Hub → sistema satélite)

Configure no produto:
- `webhook_url`
- `webhook_secret`

O Hub envia `POST` com assinatura HMAC:

```text
X-Hub-Signature: sha256=<assinatura_hex>
X-Hub-Event: payment.approved
Content-Type: application/json
```

Payload:

```json
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
  "createdAt": "2026-03-29T21:27:16.000Z"
}
```

Eventos:
- `payment.approved` — pagamento confirmado (licença ativada)
- `payment.failed` — falha no pagamento
- `payment.chargeback` — contestação
- `pix.expired` — PIX expirado
- `subscription.canceled` — assinatura cancelada
- `license.activated` — licença emitida ou renovada
- `license.suspended` — licença suspensa
- `license.revoked` — licença revogada permanentemente

Validação HMAC:

```typescript
import crypto from 'crypto'

function isValidHubSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signature.replace('sha256=', '')
  return expected === received
}
```

## Webhook de entrada (Gateway → Hub)

URLs para configurar no painel do gateway:

```text
https://seu-dominio.com/api/v1/webhooks/gateway/mercadopago
https://seu-dominio.com/api/v1/webhooks/gateway/asaas
```

---

## Códigos de resposta e erros

### Access API (API Key)
- `200` / `201` — requisição processada (decidir por `canAccess` ou `allowed`)
- `422` — payload inválido
- `401` — API Key ausente/inválida/inativa

### Endpoints administrativos (JWT)
- `200` / `201` — sucesso
- `401` — token inválido/ausente
- `403` — role sem permissão
- `404` — recurso não encontrado
- `429` — limite de requisições excedido
- `422` — payload inválido
- `500` — erro interno

Payload de erro padrão:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "document must be longer than or equal to 11 characters",
  "details": ["document must be longer than or equal to 11 characters"],
  "correlationId": "2aa7bf04-f8c9-43c7-bf6f-efde44f56a22",
  "timestamp": "2026-03-30T22:00:00.000Z",
  "path": "/api/v1/access/resolve",
  "statusCode": 422
}
```

---

## Exemplos de código

### Node.js / TypeScript

```typescript
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

export async function resolveAccess(
  document: string,
  personType: 'PF' | 'PJ',
  name: string,
  email: string
): Promise<ResolveResult> {
  const res = await fetch(`${BASE_URL}/access/resolve`, {
    method: 'POST',
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ document, personType, productId: PRODUCT_ID, name, email }),
  })
  if (res.status === 401) throw new Error('API Key inválida')
  if (!res.ok) throw new Error(`Hub Billing error: ${res.status}`)
  return res.json()
}
```

### cURL

```bash
curl -s -X POST \
  -H "X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{"document":"123.456.789-09","personType":"PF","productId":"UUID_PRODUTO","name":"Maria","email":"maria@ex.com"}' \
  "https://billing.seudominio.com/api/v1/access/resolve" | jq .
```

---

## SDKs e cache

```javascript
async function checkAccessCached(customerId, productId, redis) {
  const cacheKey = `access-status:${customerId}:${productId}`
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached)

  const result = await getAccessStatus(customerId)
  const ttl = result.canAccess ? 60 : 10
  await redis.setex(cacheKey, ttl, JSON.stringify(result))

  return result
}
```

---

## Boas práticas de integração

- **Uma chamada de resolve por login** — chame `POST /access/resolve` uma vez no login e armazene o resultado em sessão
- **Consultas periódicas com status** — use `GET /access/status` para refreshes periódicos (não o resolve)
- Aplicar cache curto: 10s para bloqueios, 60s para acesso liberado
- Exibir o campo `banner` quando não nulo — ele contém mensagem pronta para o usuário
- Usar API Key por sistema e por ambiente (nunca expor em frontend)
- Processar webhook de forma idempotente no satélite
- Tratar retries em falhas de rede e respostas `5xx`

---

## Checklist de Go Live

- [ ] API Key criada e salva com segurança
- [ ] `trial_days` configurado no produto (se aplicável)
- [ ] `POST /access/resolve` integrado no fluxo de login
- [ ] `GET /access/status` integrado para consultas periódicas
- [ ] Banner exibido quando `banner != null`
- [ ] Tela de conversão implementada para `canAccess: false`
- [ ] Fluxo de checkout validado (PIX, boleto, cartão quando aplicável)
- [ ] Webhook de saída configurado e assinatura HMAC validada
- [ ] Monitoramento e logs de integração habilitados
