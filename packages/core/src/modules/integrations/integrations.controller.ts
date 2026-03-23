import { Controller, Get, Post, Delete, Body, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { Roles } from '../../shared/guards/admin-jwt.guard'
import { IsString, IsUUID } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { IntegrationsService } from './integrations.service'

class CreateApiKeyDto {
  @ApiProperty() @IsUUID() productId: string
  @ApiProperty() @IsString() name: string
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
