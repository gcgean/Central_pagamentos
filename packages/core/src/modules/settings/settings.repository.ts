import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class SettingsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async ensureTable() {
    await this.sql`
      CREATE TABLE IF NOT EXISTS settings (
        key         VARCHAR(100) PRIMARY KEY,
        value       TEXT,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `
  }

  async get(key: string): Promise<string | null> {
    const [row] = await this.sql`
      SELECT value FROM settings WHERE key = ${key}
    `
    return row?.value ?? null
  }

  async set(key: string, value: string): Promise<void> {
    await this.sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${key}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value, updated_at = NOW()
    `
  }

  async getByPrefix(prefix: string): Promise<Record<string, string>> {
    const rows = await this.sql<{ key: string; value: string }[]>`
      SELECT key, value FROM settings WHERE key LIKE ${prefix + '%'}
    `
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  }
}
