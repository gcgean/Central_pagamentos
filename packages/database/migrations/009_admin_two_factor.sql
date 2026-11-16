-- Verificação em duas etapas no login do painel (16/11/2026).
-- Senha certa num aparelho que ainda não é de confiança pede um código de
-- 6 dígitos enviado ao e-mail do admin (10 minutos, 5 tentativas).
-- Só tabelas novas: nada existente é alterado; rollback = DROP das duas.

CREATE TABLE IF NOT EXISTS admin_login_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id     UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  code_hash    VARCHAR(100) NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_login_codes_admin ON admin_login_codes (admin_id, created_at DESC);

-- "Confiar neste aparelho": o navegador guarda um token aleatório; aqui só o hash.
CREATE TABLE IF NOT EXISTS admin_trusted_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id      UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  token_hash    VARCHAR(64) NOT NULL UNIQUE,
  label         VARCHAR(120),
  ip            VARCHAR(64),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_trusted_devices_admin ON admin_trusted_devices (admin_id);
