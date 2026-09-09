-- =============================================================================
-- Migration 008 — E-mail passa a identificar o cliente, no lugar do documento
--
-- Por que: o documento era UNIQUE global, entao a mesma pessoa nao podia ter
-- dois cadastros — nem em produtos diferentes, nem no mesmo produto. Um
-- assinante do NoSigilo que ja tinha conta recebia "CPF/CNPJ ja vinculado a
-- outro cadastro" e o pagamento morria ali.
--
-- O documento continua guardado e continua obrigatorio onde a lei exige (PIX
-- valida CPF/CNPJ do titular no checkout). Ele deixa de ser IDENTIDADE e passa
-- a ser DADO DE COBRANCA — o que tambem abre caminho para vender fora do
-- Brasil, onde nao ha CPF e o pagamento e por cartao.
--
-- Seguranca da troca, verificada em producao antes de aplicar:
--   - emails duplicados em customers ... 0
--   - clientes 970 / documentos distintos 970 (ninguem compartilha documento)
-- Ou seja: nenhuma linha existente muda de dono e o indice unico de e-mail
-- nasce sem conflito.
-- =============================================================================

ALTER TABLE customers DROP CONSTRAINT IF EXISTS uq_customers_document;

-- O e-mail e comparado sempre em lowercase na aplicacao; o indice acompanha,
-- senao "Joao@x.com" e "joao@x.com" seriam dois clientes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_lower
  ON customers (lower(email));

-- idx_customers_document_clean permanece: a busca por documento continua
-- existindo (suporte, conciliacao), so nao e mais garantia de unicidade.
COMMENT ON COLUMN customers.document IS
  'CPF/CNPJ do cliente. Dado de cobranca, NAO identidade — pode repetir entre '
  'clientes desde a migration 008. Para cliente sem documento (venda fora do '
  'Brasil), a aplicacao gera um valor sintetico prefixado com 9.';
