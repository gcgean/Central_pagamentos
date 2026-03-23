import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { ProductsService } from './products.service'
import { CreateProductDto } from './dto/create-product.dto'

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
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.service.update(id, dto)
  }
}
