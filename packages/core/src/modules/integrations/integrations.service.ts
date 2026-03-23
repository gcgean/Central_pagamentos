import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { createHash, randomBytes } from 'crypto'

@Injectable()
export class IntegrationsService {

  private readonly logger = new Logger(IntegrationsService.name)

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async generateApiKey(productId: string, name: string): Promise<{ apiKey: string; integration: any }> {
    const [product] = await this.sql`SELECT id FROM products WHERE id = ${productId}`
    if (!product) throw new NotFoundException(`Produto ${productId} não encontrado`)

    const rawKey = `hub_live_${randomBytes(24).toString('hex')}`
    const keyHash = createHash('sha256').update(rawKey).digest('hex')
    const keyPreview = `${rawKey.slice(0, 16)}...`

    const [row] = await this.sql`
      INSERT INTO integrations (product_id, name, api_key, api_key_hash)
      VALUES (${productId}, ${name}, ${keyPreview}, ${keyHash})
      RETURNING id, product_id, name, api_key, is_active, created_at
    `

    this.logger.log(`API key gerada para produto ${productId}: ${keyPreview}`)
    return {
      apiKey: rawKey,
      integration: {
        id:         row.id,
        productId:  row.product_id,
        name:       row.name,
        keyPreview: row.api_key,
        isActive:   row.is_active,
        createdAt:  row.created_at,
      },
    }
  }

  async listByProduct(productId: string) {
    const rows = await this.sql`
      SELECT id, product_id, name, api_key, is_active, last_used_at, created_at
      FROM integrations
      WHERE product_id = ${productId}
      ORDER BY created_at DESC
    `
    return rows.map(r => ({
      id:          r.id,
      productId:   r.product_id,
      name:        r.name,
      keyPreview:  r.api_key,
      isActive:    r.is_active,
      lastUsedAt:  r.last_used_at,
      createdAt:   r.created_at,
    }))
  }

  async revoke(id: string): Promise<void> {
    await this.sql`UPDATE integrations SET is_active = false WHERE id = ${id}`
    this.logger.log(`API key revogada: ${id}`)
  }
}
