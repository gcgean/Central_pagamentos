import { Controller, Get, Post, Put, Param, Body, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { PlansService } from './plans.service'

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

  @Put(':planId')
  @ApiOperation({ summary: 'Editar plano de um produto' })
  update(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body() dto: any,
  ) {
    return this.service.update(productId, planId, dto)
  }

  @Put(':planId/activate')
  @ApiOperation({ summary: 'Ativar plano' })
  activate(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Param('planId', ParseUUIDPipe) planId: string,
  ) {
    return this.service.activate(productId, planId)
  }

  @Put(':planId/deactivate')
  @ApiOperation({ summary: 'Desativar plano (apenas se sem assinaturas ativas)' })
  deactivate(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.service.deactivate(planId)
  }

  @Put(':planId/archive')
  @ApiOperation({ summary: 'Arquivar plano (apenas se sem assinaturas ativas)' })
  archive(@Param('planId', ParseUUIDPipe) planId: string) {
    return this.service.archive(planId)
  }
}
