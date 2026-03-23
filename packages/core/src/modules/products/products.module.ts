// ── products.module.ts ────────────────────────────────────────────────────────
import { Module } from '@nestjs/common'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'
import { ProductsRepository } from './products.repository'

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsRepository],
  exports: [ProductsService],
})
export class ProductsModule {}

// ── products.service.ts ────────────────────────────────────────────────────────
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { ProductsRepository } from './products.repository'
import { CreateProductDto } from './dto/create-product.dto'

@Injectable()
export class ProductsService {

  constructor(private readonly repo: ProductsRepository) {}

  async create(dto: CreateProductDto) {
    const existing = await this.repo.findByCode(dto.code)
    if (existing) throw new ConflictException(`Código de produto já existe: ${dto.code}`)
    return this.repo.create(dto)
  }

  async findAll() { return this.repo.findAll() }

  async findById(id: string) {
    const p = await this.repo.findById(id)
    if (!p) throw new NotFoundException(`Produto ${id} não encontrado`)
    return p
  }

  async findByCode(code: string) {
    const p = await this.repo.findByCode(code)
    if (!p) throw new NotFoundException(`Produto com código "${code}" não encontrado`)
    return p
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    await this.findById(id)
    return this.repo.update(id, dto)
  }
}

// ── products.controller.ts ─────────────────────────────────────────────────────
import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'products', version: '1' })
export class ProductsController {

  constructor(private readonly service: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Cadastrar novo produto/sistema' })
  create(@Body() dto: CreateProductDto) { return this.service.create(dto) }

  @Get()
  @ApiOperation({ summary: 'Listar todos os produtos' })
  findAll() { return this.service.findAll() }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) { return this.service.findById(id) }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) { return this.service.findByCode(code) }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: any) {
    return this.service.update(id, dto)
  }
}

// ── plans.module.ts ───────────────────────────────────────────────────────────
import { PlansController } from './plans.controller'
import { PlansService } from './plans.service'
import { PlansRepository } from './plans.repository'

@Module({
  controllers: [PlansController],
  providers: [PlansService, PlansRepository],
  exports: [PlansService],
})
export class PlansModule {}

// ── plans.service.ts ──────────────────────────────────────────────────────────
@Injectable()
export class PlansService {

  constructor(private readonly repo: PlansRepository) {}

  async create(dto: any) { return this.repo.create(dto) }
  async findByProduct(productId: string) { return this.repo.findByProduct(productId) }
  async findById(id: string) {
    const p = await this.repo.findById(id)
    if (!p) throw new NotFoundException(`Plano ${id} não encontrado`)
    return p
  }

  // Arquiva o plano — planos com assinaturas ativas não podem ser deletados
  async archive(id: string) {
    const plan = await this.findById(id)
    const [active] = await this.repo.countActiveSubscriptions(id)
    if (active?.count > 0) {
      throw new ConflictException(
        `Plano possui ${active.count} assinaturas ativas. Arquive apenas após migração.`
      )
    }
    return this.repo.update(id, { status: 'archived' })
  }
}

// ── plans.controller.ts ────────────────────────────────────────────────────────
@ApiTags('products')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'products/:productId/plans', version: '1' })
export class PlansController {

  constructor(private readonly service: PlansService) {}

  @Post()
  @ApiOperation({ summary: 'Criar plano para um produto' })
  create(@Param('productId', ParseUUIDPipe) productId: string, @Body() dto: any) {
    return this.service.create({ ...dto, productId })
  }

  @Get()
  @ApiOperation({ summary: 'Listar planos de um produto' })
  findAll(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.service.findByProduct(productId)
  }

  @Put(':planId/archive')
  @ApiOperation({ summary: 'Arquivar plano (apenas se sem assinaturas ativas)' })
  archive(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.service.archive(planId)
  }
}
