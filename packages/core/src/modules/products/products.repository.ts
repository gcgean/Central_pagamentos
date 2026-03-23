import { Injectable, Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

@Injectable()
export class ProductsRepository {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async create(data: any) {
    const [row] = await this.sql`
      INSERT INTO products (code, name, description, is_active)
      VALUES (${data.code}, ${data.name}, ${data.description ?? null}, ${data.isActive ?? true})
      RETURNING *
    `
    return this.map(row)
  }

  async findAll() {
    const rows = await this.sql`SELECT * FROM products ORDER BY name`
    return rows.map(r => this.map(r))
  }

  async findById(id: string) {
    const [row] = await this.sql`SELECT * FROM products WHERE id = ${id}`
    return row ? this.map(row) : null
  }

  async findByCode(code: string) {
    const [row] = await this.sql`SELECT * FROM products WHERE code = ${code}`
    return row ? this.map(row) : null
  }

  async update(id: string, data: any) {
    const [row] = await this.sql`
      UPDATE products SET
        name        = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        is_active   = COALESCE(${data.isActive ?? null}, is_active),
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING *
    `
    return this.map(row)
  }

  private map(row: any) {
    return {
      id:          row.id,
      code:        row.code,
      name:        row.name,
      description: row.description,
      isActive:    row.is_active,
      createdAt:   row.created_at,
      updatedAt:   row.updated_at,
    }
  }
}
