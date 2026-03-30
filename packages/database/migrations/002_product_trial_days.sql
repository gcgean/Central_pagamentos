-- =============================================================================
-- Migration 002 — Adiciona trial_days na tabela products
--
-- Permite configurar um período de avaliação gratuita por produto.
-- Este campo controla o trial no fluxo de resolução de acesso (POST /access/resolve)
-- sem dependência de plano, pois o resolve ocorre antes da escolha de plano.
--
-- O campo trial_days nos plans continua sendo usado no fluxo de assinatura
-- (POST /subscriptions) para variações de trial por plano comercial.
-- =============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS trial_days SMALLINT NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.trial_days IS
  'Dias de trial gratuito concedidos automaticamente no primeiro acesso ao produto. '
  '0 = sem trial. Controlado exclusivamente pelo Hub; trial por customer+product é único.';
