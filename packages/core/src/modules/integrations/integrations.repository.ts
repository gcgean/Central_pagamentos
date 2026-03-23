import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class IntegrationsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async findByKeyHash(keyHash: string) {
    const [row] = await this.sql`
      SELECT * FROM integrations WHERE api_key_hash = ${keyHash} AND is_active = true
    `
    return row ?? null
  }

  async updateLastUsed(id: string) {
    await this.sql`
      UPDATE integrations SET last_used_at = NOW() WHERE id = ${id}
    `
  }
}
