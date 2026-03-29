# Guia de Integração — Sistemas Satélites

Este documento descreve o padrão oficial para integrar sistemas externos ao Hub Billing com foco em:
- validação de acesso/licença
- geração de cobrança
- acompanhamento de status de pagamento
- recebimento de confirmações por webhook

## Visão geral de arquitetura

```text
Sistema Satélite  ->  Hub Billing API  ->  Gateway (Mercado Pago / Asaas)
                         |
                         ->  Webhook de saída (Hub -> Satélite)
```

O sistema satélite não precisa integrar diretamente com gateway de pagamento.

## Base URL

```text
https://seu-dominio.com/api/v1
```

## Autenticação

Existem dois modelos de autenticação:

### 1) API Key (integração de acesso)

Use em endpoints de acesso/licenças para runtime do sistema satélite:

```http
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

### 2) JWT Admin (operações financeiras e de gestão)

Use em endpoints para criar pedido, checkout e consultar cobranças:

```http
Authorization: Bearer <accessToken>
```

Login para obter token:

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "gcgean@hotmail.com",
  "password": "SUA_SENHA_FORTE"
}
```

## Fluxo recomendado de integração

1. Gerar API Key por produto no painel em Integrações
2. Validar acesso no login e em checkpoints críticos usando `GET /access/...`
3. Quando sem licença, criar pedido e checkout via JWT Admin
4. Exibir QR Code PIX, link de boleto ou retorno de cartão
5. Acompanhar status por `GET /payments/charges`
6. Receber eventos do Hub via webhook de saída para sincronização local

## Endpoints para sistema satélite

### Validar acesso de cliente ao produto

```http
GET /access/customer/{customerId}/product/{productCode}
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
  "checkedAt": "2026-03-23T10:00:00.000Z"
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
  "checkedAt": "2026-03-23T10:00:00.000Z"
}
```

### Carregar todos os entitlements do cliente

```http
GET /access/entitlements/{customerId}
X-API-Key: hub_live_xxxxxxxxxxxxxxxxxxxx
```

Resposta:

```json
{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
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
        "max_users": 10
      }
    }
  ]
}
```

## Endpoints financeiros para integração server-to-server

### Criar pedido

```http
POST /orders
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "customerId": "2db2626d-4e1d-4ff3-a898-152a37a883d9",
  "productId": "uuid-do-produto",
  "planId": "uuid-do-plano",
  "contractedAmount": 99
}
```

### Gerar checkout/cobrança do pedido

```http
POST /orders/{orderId}/checkout
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
  "checkoutUrl": null,
  "pixQrCode": "data:image/png;base64,...",
  "pixPayload": "00020126...",
  "boletoUrl": null,
  "amount": 99,
  "currency": "BRL",
  "dueDate": "2026-03-31"
}
```

### Consultar cobranças por origem

```http
GET /payments/charges?originType=order&originId={orderId}
Authorization: Bearer <accessToken>
```

## Webhook de saída (Hub -> sistema satélite)

Configure no produto:
- `webhook_url`
- `webhook_secret`

O Hub envia POST com assinatura HMAC:

Headers:

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
    "status": "approved",
    "amount": 99
  },
  "createdAt": "2026-03-28T21:27:16.000Z"
}
```

Eventos mais comuns:
- `payment.approved`
- `payment.failed`
- `payment.chargeback`
- `pix.expired`
- `subscription.canceled`

Validação HMAC:

```ts
import crypto from 'crypto'

function isValidHubSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = signature.replace('sha256=', '')
  return expected === received
}
```

## Webhook de entrada (Gateway -> Hub)

URLs para configurar no painel do gateway:

```text
https://seu-dominio.com/api/v1/webhooks/gateway/mercadopago
https://seu-dominio.com/api/v1/webhooks/gateway/asaas
```

## Códigos de resposta e erros

### Access API
- `200`: requisição processada, decidir por `allowed`
- `401`: API Key ausente/inválida/inativa
- `422`: parâmetros inválidos
- `500`: erro interno

### Endpoints administrativos (JWT)
- `200/201`: sucesso
- `401`: token inválido/ausente
- `403`: role sem permissão
- `404`: recurso não encontrado
- `422`: payload inválido
- `500`: erro interno

Reasons de negação de acesso:
- `customer_not_found`
- `customer_blocked`
- `product_not_found`
- `no_license`
- `license_inactive`
- `license_suspended`
- `grace_period` (allowed pode ser true)
- `license_expired`
- `license_revoked`

## Boas práticas de integração

- Usar API Key por sistema e por ambiente
- Nunca expor segredos em frontend
- Aplicar cache curto de acesso (10s para negações, 30-60s para acesso liberado)
- Tratar retries em falhas de rede e `5xx`
- Processar webhook de forma idempotente no satélite
- Responder webhook rapidamente e processar assíncrono

## Checklist de Go Live

- API Key criada e salva com segurança
- Produto correto vinculado ao sistema satélite
- Fluxo de checkout validado (PIX, boleto, cartão quando aplicável)
- Webhook de saída configurado e assinatura validada
- Rotina de reconciliação por `GET /payments/charges` implementada
- Monitoramento e logs de integração habilitados
