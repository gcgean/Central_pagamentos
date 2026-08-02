-- =============================================================================
-- Migration 006 — Adiciona 'stripe' como gateway válido em products.gateway_name
-- =============================================================================

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_gateway_name_check;

ALTER TABLE products
  ADD CONSTRAINT products_gateway_name_check
  CHECK (gateway_name IS NULL OR gateway_name IN ('asaas', 'mercadopago', 'livepix', 'stripe'));
