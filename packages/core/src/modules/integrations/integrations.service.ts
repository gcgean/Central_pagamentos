import { Injectable, NotFoundException, Logger } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { createHash, randomBytes } from 'crypto'

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

@Injectable()
export class IntegrationsService {

  private readonly logger = new Logger(IntegrationsService.name)

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  // Gera uma nova API key para um sistema satélite
  async generateApiKey(productId: string, name: string): Promise<{ apiKey: string; integration: any }> {
    // Garante que o produto existe
    const [product] = await this.sql`SELECT id FROM products WHERE id = ${productId}`
    if (!product) throw new NotFoundException(`Produto ${productId} não encontrado`)

    // Gera a key: hub_live_xxxxxxxxxxxxxxxx (32 bytes = 64 hex chars)
    const rawKey = `hub_live_${randomBytes(24).toString('hex')}`

    // Hash SHA-256 para armazenar (nunca armazenamos a key em plain text)
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    // api_key armazena apenas o prefixo visível (para identificação no admin)
    const keyPreview = `${rawKey.slice(0, 16)}...`

    const [integration] = await this.sql`
      INSERT INTO integrations (product_id, name, api_key, api_key_hash)
      VALUES (${productId}, ${name}, ${keyPreview}, ${keyHash})
      RETURNING id, product_id, name, api_key, is_active, created_at
    `

    this.logger.log(`API key gerada para produto ${productId}: ${keyPreview}`)

    // Retorna a key APENAS neste momento — nunca mais será acessível
    return { apiKey: rawKey, integration }
  }

  async listByProduct(productId: string) {
    return this.sql`
      SELECT id, product_id, name, api_key, is_active, last_used_at, created_at
      FROM integrations
      WHERE product_id = ${productId}
      ORDER BY created_at DESC
    `
  }

  async revoke(id: string): Promise<void> {
    await this.sql`UPDATE integrations SET is_active = false WHERE id = ${id}`
    this.logger.log(`API key revogada: ${id}`)
  }
}

// ── integrations.controller.ts ────────────────────────────────────────────────
import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { Roles } from '../../shared/guards/admin-jwt.guard'
import { IsString, IsUUID } from 'class-validator'

class CreateApiKeyDto {
  @IsUUID()
  productId: string

  @IsString()
  name: string
}

@ApiTags('integrations')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Roles('super_admin', 'operations')
@Controller({ path: 'integrations', version: '1' })
export class IntegrationsController {

  constructor(private readonly service: IntegrationsService) {}

  @Post('api-keys')
  @ApiOperation({
    summary: 'Gerar nova API key para sistema satélite',
    description: 'A chave gerada é mostrada APENAS uma vez. Guarde-a com segurança.',
  })
  generateKey(@Body() dto: CreateApiKeyDto) {
    return this.service.generateApiKey(dto.productId, dto.name)
  }

  @Get('api-keys/:productId')
  @ApiOperation({ summary: 'Listar API keys de um produto' })
  listKeys(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.listByProduct(productId)
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Revogar API key' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.revoke(id)
  }
}
