-- =============================================================================
-- Migration 007 — Roteamento de gateway por método de pagamento (produto)
--
-- Permite escolher, por produto, um gateway diferente para cada método de
-- pagamento (ex: PIX no Asaas, Cartão na Stripe, Boleto no Asaas), além do
-- gateway único já existente (gateway_name), que passa a servir como fallback
-- para métodos sem override específico.
--
-- Formato: {"PIX": "asaas", "CREDIT_CARD": "stripe", "BOLETO": "asaas"}
-- Todas as chaves são opcionais. NULL/ausente = usa gateway_name > gateway
-- ativo global (comportamento inalterado).
-- =============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS gateway_routing JSONB;

COMMENT ON COLUMN products.gateway_routing IS
  'Override de gateway por método de pagamento: {"PIX": "...", "CREDIT_CARD": "...", "BOLETO": "..."}. '
  'Método sem chave definida cai para gateway_name, depois para o gateway ativo global.';
