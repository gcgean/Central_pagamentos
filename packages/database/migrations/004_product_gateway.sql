-- =============================================================================
-- Migration 004 — Adiciona gateway_name na tabela products
--
-- Permite escolher, por produto, qual gateway de pagamento processa suas
-- cobranças (ex: produto X usa Mercado Pago, produto Y usa Asaas), em vez de
-- depender exclusivamente do gateway ativo global (Configurações → Gateway).
--
-- NULL = usa o gateway ativo global (comportamento atual, sem mudança).
-- =============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gateway_name VARCHAR(20);

ALTER TABLE products
  ADD CONSTRAINT products_gateway_name_check
  CHECK (gateway_name IS NULL OR gateway_name IN ('asaas', 'mercadopago'));

COMMENT ON COLUMN products.gateway_name IS
  'Gateway de pagamento específico deste produto (asaas | mercadopago). '
  'NULL = usa o gateway ativo global definido em Configurações → Gateway.';
