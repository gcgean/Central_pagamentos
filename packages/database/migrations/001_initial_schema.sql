-- =============================================================================
-- Hub Central de Billing, Pagamentos e Licenciamento
-- Migration 001 — Schema inicial completo
-- =============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE person_type        AS ENUM ('PF', 'PJ');
CREATE TYPE customer_status    AS ENUM ('active', 'inactive', 'blocked');
CREATE TYPE product_billing    AS ENUM ('recurring', 'one_time', 'hybrid');
CREATE TYPE product_status     AS ENUM ('active', 'inactive', 'draft');
CREATE TYPE plan_interval      AS ENUM ('day', 'week', 'month', 'year', 'lifetime');
CREATE TYPE plan_status        AS ENUM ('active', 'inactive', 'archived');
CREATE TYPE subscription_status AS ENUM ('pending', 'trialing', 'active', 'overdue', 'suspended', 'canceled', 'expired');
CREATE TYPE order_status       AS ENUM ('draft', 'pending_payment', 'paid', 'canceled', 'refunded', 'expired');
CREATE TYPE invoice_status     AS ENUM ('open', 'paid', 'void', 'uncollectible');
CREATE TYPE charge_status      AS ENUM ('pending', 'processing', 'paid', 'failed', 'refunded', 'canceled');
CREATE TYPE payment_method     AS ENUM ('pix', 'credit_card', 'debit_card', 'boleto');
CREATE TYPE payment_status     AS ENUM ('pending', 'authorized', 'captured', 'failed', 'refunded');
CREATE TYPE license_status     AS ENUM ('active', 'inactive', 'suspended', 'expired', 'revoked');
CREATE TYPE license_origin     AS ENUM ('subscription', 'order', 'manual', 'trial');
CREATE TYPE actor_type         AS ENUM ('admin', 'system', 'api', 'webhook');
CREATE TYPE webhook_direction  AS ENUM ('inbound', 'outbound');

-- =============================================================================
-- CUSTOMERS — Clientes (PF ou PJ), identificados por CPF/CNPJ
-- =============================================================================

CREATE TABLE customers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    person_type     person_type NOT NULL,
    document        VARCHAR(18) NOT NULL,          -- CPF (000.000.000-00) ou CNPJ (00.000.000/0000-00)
    document_clean  VARCHAR(14) NOT NULL,          -- Somente dígitos, para busca/validação
    legal_name      VARCHAR(255) NOT NULL,         -- Nome ou Razão Social
    trade_name      VARCHAR(255),                  -- Nome Fantasia (PJ)
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    status          customer_status NOT NULL DEFAULT 'active',

    -- Endereço
    address_zip     VARCHAR(9),
    address_street  VARCHAR(255),
    address_number  VARCHAR(20),
    address_comp    VARCHAR(100),
    address_district VARCHAR(100),
    address_city    VARCHAR(100),
    address_state   CHAR(2),
    address_country CHAR(2) DEFAULT 'BR',

    notes           TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_customers_document UNIQUE (document_clean)
);

CREATE INDEX idx_customers_document_clean ON customers (document_clean);
CREATE INDEX idx_customers_email          ON customers (email);
CREATE INDEX idx_customers_status         ON customers (status);

-- Usuários vinculados ao cliente (modelo multiusuário)
CREATE TABLE customer_users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) NOT NULL,
    role        VARCHAR(50) NOT NULL DEFAULT 'user',
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    external_id VARCHAR(255),                      -- ID no sistema satélite, se necessário
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_customer_users_email UNIQUE (customer_id, email)
);

CREATE INDEX idx_customer_users_customer ON customer_users (customer_id);

-- =============================================================================
-- PRODUCTS — Sistemas comercializados
-- =============================================================================

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(50) NOT NULL,          -- ex: erp_clinico, pdv_retail
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(100),
    billing_type    product_billing NOT NULL,
    system_base_url VARCHAR(500),                  -- URL base do satélite, para redirect/SSO futuro
    webhook_url     VARCHAR(500),                  -- Endpoint do satélite para receber eventos internos
    webhook_secret  VARCHAR(255),                  -- HMAC secret para validação
    status          product_status NOT NULL DEFAULT 'draft',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_products_code UNIQUE (code)
);

CREATE INDEX idx_products_code   ON products (code);
CREATE INDEX idx_products_status ON products (status);

-- =============================================================================
-- PLANS — Ofertas comerciais de cada produto
-- Planos são IMUTÁVEIS após terem assinaturas ativas.
-- Para alterar preço, crie um novo plano e arquive o anterior.
-- =============================================================================

CREATE TABLE plans (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    code                VARCHAR(50) NOT NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,

    -- Cobrança
    amount              INTEGER NOT NULL,           -- Em centavos (evita float)
    currency            CHAR(3) NOT NULL DEFAULT 'BRL',
    interval_unit       plan_interval NOT NULL,
    interval_count      SMALLINT NOT NULL DEFAULT 1, -- ex: 3 meses = interval_count=3, unit=month

    -- Parcelamento
    allow_installments  BOOLEAN NOT NULL DEFAULT FALSE,
    max_installments    SMALLINT,

    -- Trial
    trial_days          SMALLINT NOT NULL DEFAULT 0,
    require_card_trial  BOOLEAN NOT NULL DEFAULT FALSE,

    -- Limites
    max_users           SMALLINT,
    feature_set         JSONB DEFAULT '{}',         -- Recursos incluídos

    status              plan_status NOT NULL DEFAULT 'active',
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_plans_code UNIQUE (product_id, code),
    CONSTRAINT chk_plans_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_plans_interval_count  CHECK (interval_count > 0)
);

CREATE INDEX idx_plans_product ON plans (product_id);
CREATE INDEX idx_plans_status  ON plans (status);

-- =============================================================================
-- SUBSCRIPTIONS — Assinaturas recorrentes
-- =============================================================================

CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id             UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    plan_id                 UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,

    -- Valor contratado no momento da adesão (protege contra mudança de plano)
    contracted_amount       INTEGER NOT NULL,
    contracted_currency     CHAR(3) NOT NULL DEFAULT 'BRL',

    -- IDs externos
    external_subscription_id VARCHAR(255),          -- ID no gateway
    gateway_name            VARCHAR(50),

    status                  subscription_status NOT NULL DEFAULT 'pending',

    -- Datas de ciclo
    started_at              TIMESTAMPTZ,
    trial_ends_at           TIMESTAMPTZ,
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    next_billing_at         TIMESTAMPTZ,
    canceled_at             TIMESTAMPTZ,
    cancellation_reason     TEXT,

    metadata                JSONB DEFAULT '{}',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_customer    ON subscriptions (customer_id);
CREATE INDEX idx_subscriptions_product     ON subscriptions (product_id);
CREATE INDEX idx_subscriptions_status      ON subscriptions (status);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions (next_billing_at) WHERE status IN ('active', 'overdue');

-- =============================================================================
-- ORDERS — Pedidos de compra avulsa (one_time)
-- =============================================================================

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    plan_id         UUID REFERENCES plans(id),

    contracted_amount   INTEGER NOT NULL,
    contracted_currency CHAR(3) NOT NULL DEFAULT 'BRL',

    status          order_status NOT NULL DEFAULT 'draft',
    paid_at         TIMESTAMPTZ,
    canceled_at     TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,                   -- Se tiver prazo de validade
    cancellation_reason TEXT,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE INDEX idx_orders_product  ON orders (product_id);
CREATE INDEX idx_orders_status   ON orders (status);

-- =============================================================================
-- INVOICES — Faturas geradas por ciclo de assinatura ou pedido
-- Uma invoice pode ter múltiplas tentativas de cobrança (charges)
-- =============================================================================

CREATE TABLE invoices (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    subscription_id UUID REFERENCES subscriptions(id),
    order_id        UUID REFERENCES orders(id),

    amount          INTEGER NOT NULL,               -- Total em centavos
    currency        CHAR(3) NOT NULL DEFAULT 'BRL',
    status          invoice_status NOT NULL DEFAULT 'open',

    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    due_date        DATE NOT NULL,
    paid_at         TIMESTAMPTZ,
    voided_at       TIMESTAMPTZ,

    external_invoice_id VARCHAR(255),               -- ID da fatura no gateway
    gateway_name    VARCHAR(50),

    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_invoices_origin CHECK (
        (subscription_id IS NOT NULL AND order_id IS NULL) OR
        (subscription_id IS NULL AND order_id IS NOT NULL)
    )
);

CREATE INDEX idx_invoices_customer      ON invoices (customer_id);
CREATE INDEX idx_invoices_subscription  ON invoices (subscription_id);
CREATE INDEX idx_invoices_order         ON invoices (order_id);
CREATE INDEX idx_invoices_status        ON invoices (status);
CREATE INDEX idx_invoices_due_date      ON invoices (due_date) WHERE status = 'open';

-- =============================================================================
-- CHARGES — Tentativas de cobrança dentro de uma invoice
-- Cada nova tentativa (retry) gera um novo charge
-- =============================================================================

CREATE TABLE charges (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_id          UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    customer_id         UUID NOT NULL REFERENCES customers(id),

    amount              INTEGER NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'BRL',
    payment_method      payment_method,
    installment_count   SMALLINT DEFAULT 1,
    status              charge_status NOT NULL DEFAULT 'pending',

    gateway_name        VARCHAR(50) NOT NULL,
    external_charge_id  VARCHAR(255),
    checkout_url        VARCHAR(1000),

    -- Pix
    pix_qr_code         TEXT,
    pix_expires_at      TIMESTAMPTZ,

    -- Boleto
    boleto_url          VARCHAR(1000),
    boleto_barcode      VARCHAR(255),
    boleto_due_date     DATE,

    -- Controle de retry
    attempt_number      SMALLINT NOT NULL DEFAULT 1,
    next_retry_at       TIMESTAMPTZ,
    max_attempts        SMALLINT NOT NULL DEFAULT 3,

    failed_reason       TEXT,
    paid_at             TIMESTAMPTZ,
    canceled_at         TIMESTAMPTZ,

    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_charges_invoice        ON charges (invoice_id);
CREATE INDEX idx_charges_customer       ON charges (customer_id);
CREATE INDEX idx_charges_external       ON charges (gateway_name, external_charge_id);
CREATE INDEX idx_charges_status         ON charges (status);
CREATE INDEX idx_charges_next_retry     ON charges (next_retry_at) WHERE status = 'failed' AND next_retry_at IS NOT NULL;

-- =============================================================================
-- PAYMENTS — Pagamentos confirmados (um por charge bem-sucedido)
-- =============================================================================

CREATE TABLE payments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    charge_id           UUID NOT NULL REFERENCES charges(id) ON DELETE RESTRICT,
    customer_id         UUID NOT NULL REFERENCES customers(id),

    amount              INTEGER NOT NULL,
    currency            CHAR(3) NOT NULL DEFAULT 'BRL',
    payment_method      payment_method NOT NULL,
    status              payment_status NOT NULL DEFAULT 'pending',

    external_payment_id VARCHAR(255),
    gateway_name        VARCHAR(50) NOT NULL,

    authorized_at       TIMESTAMPTZ,
    captured_at         TIMESTAMPTZ,
    refunded_at         TIMESTAMPTZ,
    refunded_amount     INTEGER DEFAULT 0,

    raw_payload         JSONB,                      -- Payload bruto do gateway para auditoria
    metadata            JSONB DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_charge   ON payments (charge_id);
CREATE INDEX idx_payments_customer ON payments (customer_id);
CREATE INDEX idx_payments_external ON payments (gateway_name, external_payment_id);

-- =============================================================================
-- LICENSES — Direito de uso por produto. Fonte oficial de autorização.
-- Um cliente pode ter N licenças (uma por produto ativo)
-- Licenças são INDEPENDENTES — problema em uma não afeta as outras
-- =============================================================================

CREATE TABLE licenses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    plan_id         UUID REFERENCES plans(id),

    origin_type     license_origin NOT NULL,
    origin_id       UUID NOT NULL,                  -- ID da subscription ou order que gerou

    status          license_status NOT NULL DEFAULT 'inactive',

    starts_at       TIMESTAMPTZ NOT NULL,
    expires_at      TIMESTAMPTZ,                    -- NULL = vitalício
    grace_until     TIMESTAMPTZ,                    -- Prazo de carência após vencimento

    max_users       SMALLINT,
    feature_set     JSONB DEFAULT '{}',             -- Features liberadas (copiado do plano)

    suspended_at    TIMESTAMPTZ,
    suspended_reason TEXT,
    revoked_at      TIMESTAMPTZ,
    revoked_reason  TEXT,

    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Uma licença ativa por produto por cliente
CREATE UNIQUE INDEX uq_licenses_active_per_product
    ON licenses (customer_id, product_id)
    WHERE status IN ('active', 'suspended');

CREATE INDEX idx_licenses_customer ON licenses (customer_id);
CREATE INDEX idx_licenses_product  ON licenses (product_id);
CREATE INDEX idx_licenses_status   ON licenses (status);
CREATE INDEX idx_licenses_expires  ON licenses (expires_at) WHERE status = 'active' AND expires_at IS NOT NULL;

-- =============================================================================
-- WEBHOOK_EVENTS — Todos os webhooks recebidos do gateway (inbound)
-- Idempotência garantida por external_event_id + gateway_name
-- =============================================================================

CREATE TABLE webhook_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gateway_name        VARCHAR(50) NOT NULL,
    event_type          VARCHAR(100) NOT NULL,      -- ex: payment.approved, subscription.canceled
    external_event_id   VARCHAR(255) NOT NULL,
    direction           webhook_direction NOT NULL DEFAULT 'inbound',

    payload             JSONB NOT NULL,
    signature_valid     BOOLEAN,

    processed           BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at        TIMESTAMPTZ,
    processing_result   JSONB,
    error_message       TEXT,
    retry_count         SMALLINT NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_webhook_events_idempotency UNIQUE (gateway_name, external_event_id)
);

CREATE INDEX idx_webhook_events_type      ON webhook_events (event_type);
CREATE INDEX idx_webhook_events_pending   ON webhook_events (created_at) WHERE processed = FALSE;

-- =============================================================================
-- INTERNAL_EVENTS — Eventos disparados pelo hub para sistemas satélites
-- =============================================================================

CREATE TABLE internal_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id),
    customer_id     UUID NOT NULL REFERENCES customers(id),
    event_type      VARCHAR(100) NOT NULL,          -- license.activated, license.suspended, etc.
    payload         JSONB NOT NULL,

    delivered       BOOLEAN NOT NULL DEFAULT FALSE,
    delivered_at    TIMESTAMPTZ,
    http_status     SMALLINT,
    response_body   TEXT,
    retry_count     SMALLINT NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_internal_events_pending  ON internal_events (created_at) WHERE delivered = FALSE;
CREATE INDEX idx_internal_events_product  ON internal_events (product_id);

-- =============================================================================
-- INTEGRATIONS — Credenciais de sistemas satélites que consomem o hub
-- =============================================================================

CREATE TABLE integrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    api_key         VARCHAR(255) NOT NULL,           -- Gerada pelo hub, NUNCA o segredo original
    api_key_hash    VARCHAR(255) NOT NULL,           -- bcrypt hash da api_key real
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at    TIMESTAMPTZ,
    ip_whitelist    TEXT[],                          -- IPs permitidos (opcional)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_integrations_api_key_hash UNIQUE (api_key_hash)
);

CREATE INDEX idx_integrations_product ON integrations (product_id);

-- =============================================================================
-- ADMINS — Usuários do painel administrativo
-- =============================================================================

CREATE TYPE admin_role AS ENUM ('super_admin', 'financial', 'support', 'operations', 'read_only');

CREATE TABLE admins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    role            admin_role NOT NULL DEFAULT 'read_only',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_admins_email UNIQUE (email)
);

-- =============================================================================
-- AUDIT_LOGS — Trilha completa de toda ação no sistema
-- =============================================================================

CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_type  actor_type NOT NULL,
    actor_id    UUID,                               -- admin_id, integration_id ou NULL (system)
    actor_label VARCHAR(255),                       -- Email ou nome, para fácil leitura
    action      VARCHAR(100) NOT NULL,              -- ex: subscription.cancel, license.suspend
    entity_type VARCHAR(100) NOT NULL,
    entity_id   UUID NOT NULL,
    before_data JSONB,
    after_data  JSONB,
    ip_address  INET,
    user_agent  TEXT,
    note        TEXT,                               -- Observação manual, se houver
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity  ON audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor   ON audit_logs (actor_type, actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- =============================================================================
-- TRIGGERS — updated_at automático
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'customers', 'customer_users', 'products', 'plans',
        'subscriptions', 'orders', 'invoices', 'charges',
        'payments', 'licenses', 'integrations', 'admins'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            t, t
        );
    END LOOP;
END;
$$;

-- =============================================================================
-- VIEWS úteis para admin e relatórios
-- =============================================================================

-- Visão consolidada de um cliente (todos os seus produtos ativos)
CREATE VIEW v_customer_products AS
SELECT
    c.id            AS customer_id,
    c.document_clean,
    c.legal_name,
    c.email,
    p.id            AS product_id,
    p.code          AS product_code,
    p.name          AS product_name,
    l.id            AS license_id,
    l.status        AS license_status,
    l.expires_at,
    l.feature_set,
    pl.name         AS plan_name,
    pl.amount       AS plan_amount,
    CASE
        WHEN s.id IS NOT NULL THEN 'subscription'
        WHEN o.id IS NOT NULL THEN 'order'
        ELSE 'manual'
    END             AS origin_type
FROM customers c
JOIN licenses l ON l.customer_id = c.id
JOIN products p ON p.id = l.product_id
LEFT JOIN plans pl ON pl.id = l.plan_id
LEFT JOIN subscriptions s ON s.id = l.origin_id AND l.origin_type = 'subscription'
LEFT JOIN orders o ON o.id = l.origin_id AND l.origin_type = 'order';

-- MRR estimado (soma das assinaturas ativas normalizadas para mensal)
CREATE VIEW v_mrr AS
SELECT
    p.id            AS product_id,
    p.code          AS product_code,
    p.name          AS product_name,
    COUNT(s.id)     AS active_subscriptions,
    SUM(
        CASE pl.interval_unit
            WHEN 'month'    THEN s.contracted_amount / pl.interval_count
            WHEN 'year'     THEN s.contracted_amount / (pl.interval_count * 12)
            WHEN 'week'     THEN s.contracted_amount * 4
            WHEN 'day'      THEN s.contracted_amount * 30
            ELSE 0
        END
    )               AS mrr_cents
FROM subscriptions s
JOIN plans pl ON pl.id = s.plan_id
JOIN products p ON p.id = s.product_id
WHERE s.status = 'active'
GROUP BY p.id, p.code, p.name;

COMMENT ON TABLE customers         IS 'Clientes identificados por CPF ou CNPJ. Um cliente pode ter múltiplos produtos.';
COMMENT ON TABLE products          IS 'Sistemas/produtos comercializados. Código único por produto.';
COMMENT ON TABLE plans             IS 'Planos imutáveis após uso. Alterar preço = criar novo plano.';
COMMENT ON TABLE subscriptions     IS 'Assinaturas recorrentes. contracted_amount preserva o valor original.';
COMMENT ON TABLE orders            IS 'Compras avulsas (one-time). Geram licença após pagamento.';
COMMENT ON TABLE invoices          IS 'Faturas por ciclo. Uma invoice pode ter N tentativas (charges).';
COMMENT ON TABLE charges           IS 'Tentativas de cobrança. Controle de retry aqui.';
COMMENT ON TABLE payments          IS 'Pagamentos confirmados. Um por charge bem-sucedido.';
COMMENT ON TABLE licenses          IS 'Fonte oficial de autorização. Independente por produto.';
COMMENT ON TABLE webhook_events    IS 'Webhooks inbound do gateway. Idempotência por external_event_id.';
COMMENT ON TABLE internal_events   IS 'Eventos outbound para sistemas satélites.';
COMMENT ON TABLE integrations      IS 'Credenciais dos sistemas satélites. API key hasheada.';
COMMENT ON TABLE audit_logs        IS 'Trilha imutável de toda ação no sistema.';
