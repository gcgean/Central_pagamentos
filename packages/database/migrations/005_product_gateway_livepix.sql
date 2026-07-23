-- =============================================================================
-- Migration 005 — Adiciona 'livepix' como gateway válido em products.gateway_name
--
-- Complementa a migration 004 (product_gateway), permitindo que um produto seja
-- roteado especificamente para o gateway LivePix.
-- =============================================================================

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_gateway_name_check;

ALTER TABLE products
  ADD CONSTRAINT products_gateway_name_check
  CHECK (gateway_name IS NULL OR gateway_name IN ('asaas', 'mercadopago', 'livepix'));
