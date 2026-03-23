# Hub Central de Billing, Pagamentos e Licenciamento

Plataforma central responsável por gerenciar clientes, produtos, assinaturas recorrentes, vendas avulsas, cobranças, pagamentos, licenças e validação de acesso para múltiplos sistemas satélites.

## Problema que resolve

Cada novo sistema que precisa cobrar clientes teria que reimplementar integração com gateway, lógica de renovação, controle de acesso e gestão de licenças. Este hub centraliza tudo isso em uma única plataforma.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────┐
│                  Sistemas Satélites                       │
│  (consomem o hub via API — nunca falam com o gateway)    │
└────────────────────┬────────────────────────────────────┘
                     │ API Key (x-api-key)
                     ▼
┌─────────────────────────────────────────────────────────┐
│                   Hub Central                            │
│                                                          │
│  Customers │ Products │ Plans │ Subscriptions │ Orders   │
│  Invoices  │ Payments │ Licenses │ Webhooks              │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │    API de Validação de Acesso                   │    │
│  │  GET /api/v1/access/customer/:id/product/:code  │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + HMAC
                       ▼
           ┌───────────────────────┐
           │   Gateway Externo     │
           │  Asaas / Stripe       │
           └───────────────────────┘
```

### Regra estrutural mais importante

> Um mesmo cliente (CPF/CNPJ) pode ter **múltiplos produtos ativos** ao mesmo tempo.
> Cada produto tem sua **própria licença**, completamente independente.
> Problema em um produto **não afeta os demais**.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | NestJS 10 (Fastify adapter) |
| Banco | PostgreSQL 16 |
| Cache / Filas | Redis 7 + BullMQ |
| ORM | Drizzle ORM |
| Gateway (fase 1) | Asaas |
| Admin UI | React + shadcn/ui |
| Infra | Docker + docker-compose |

---

## Início rápido

### Pré-requisitos

- Node.js >= 20
- Docker + Docker Compose

### 1. Clonar e instalar

```bash
git clone <repo>
cd hub-billing
cp .env.example .env.local
npm install
```

### 2. Subir infraestrutura

```bash
docker-compose up -d postgres redis
```

O banco é criado e as migrations rodam automaticamente.

### 3. Rodar a API

```bash
cd packages/core
npm run dev
```

API disponível em `http://localhost:3000`
Swagger em `http://localhost:3000/docs`

---

## Módulos principais

### Customers
Clientes PF ou PJ identificados por CPF/CNPJ. Um cliente pode ter N produtos ativos.

### Products + Plans
Catálogo de produtos e suas configurações comerciais. Planos são imutáveis após uso — para alterar preço, crie um novo plano.

### Subscriptions
Assinaturas recorrentes. Estados: `pending → trialing → active → overdue → suspended → canceled`.

### Orders
Compras avulsas (one-time). Geram licença após pagamento confirmado.

### Invoices + Charges + Payments
Modelo em 3 camadas: uma fatura (`invoice`) pode ter N tentativas de cobrança (`charges`), cada uma com seu `payment`. Permite retry controlado sem duplicar faturas.

### Licenses
**Fonte oficial de autorização de uso.** Um cliente tem uma licença por produto. A licença tem `grace_until` para inadimplência não cortar acesso abruptamente. Estados: `active → suspended → expired → revoked`.

### Webhooks
Recebimento idempotente de eventos do gateway. Processamento assíncrono via BullMQ com retry automático.

### Access (para sistemas satélites)
```http
GET /api/v1/access/customer/{customerId}/product/{productCode}
x-api-key: <sua-api-key>
```

Resposta:
```json
{
  "customerId": "cus_123",
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

---

## Integração nos sistemas satélites

O satélite precisa implementar **apenas isso**:

1. Armazenar o `customer_id` do hub (ou consultar por CPF/CNPJ)
2. Ao iniciar uma sessão: `GET /access/customer/:id/product/:code`
3. Se `allowed: false` → redirecionar para checkout
4. Se `allowed: true` → liberar acesso com base em `features`
5. Escutar webhooks internos para eventos de ativação/suspensão

O satélite **não deve**:
- Integrar diretamente com gateway
- Manter lógica de cobrança ou renovação
- Interpretar webhooks financeiros

---

## Fluxo de pagamento aprovado

```
Gateway ──webhook──▶ Hub recebe (idempotente)
                          │
                     Enfileira no BullMQ
                          │
                    Processa: invoice.paid
                          │
                 ┌─────────────────────┐
                 │ subscription.activate│
                 │ license.emit/renew  │
                 │ internal_event.send │
                 └─────────────────────┘
                          │
              Sistema satélite recebe evento
              "license.activated" via webhook interno
```

---

## Roadmap

- **Fase 1 (MVP):** Customers, Products, Plans, Subscriptions, Orders, 1 Gateway, Licenses, API de validação, Admin básico
- **Fase 2:** Trial, Grace period, Retry policy, Upgrade/Downgrade, Cupons, Notificações, Relatórios
- **Fase 3:** Múltiplos gateways, Portal do cliente, SSO, NF-e/NFS-e, BI

---

## Estrutura do projeto

```
hub-billing/
├── packages/
│   ├── core/                    # API principal (NestJS)
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── customers/
│   │       │   ├── products/
│   │       │   ├── plans/
│   │       │   ├── subscriptions/
│   │       │   ├── orders/
│   │       │   ├── invoices/
│   │       │   ├── payments/
│   │       │   ├── licenses/    ← módulo mais crítico
│   │       │   ├── webhooks/
│   │       │   ├── access/      ← endpoint para satélites
│   │       │   ├── integrations/
│   │       │   └── admin/
│   │       └── shared/
│   │           ├── guards/      ← ApiKeyGuard, AdminJwtGuard
│   │           ├── utils/       ← CPF/CNPJ validation
│   │           └── config/
│   ├── database/
│   │   ├── migrations/          ← Schema SQL completo
│   │   └── seeds/               ← Dados de desenvolvimento
│   └── admin-ui/                ← Painel React (fase 1)
├── docker-compose.yml
├── .env.example
└── README.md
```
