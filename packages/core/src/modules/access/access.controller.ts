import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { ApiKeyGuard } from '../../shared/guards/api-key.guard'
import { AccessService } from './access.service'

@ApiTags('access')
@ApiSecurity('api-key')
@UseGuards(ApiKeyGuard)
@Controller({ path: 'access', version: '1' })
export class AccessController {

  constructor(private readonly service: AccessService) {}

  @Get('customer/:customerId/product/:productCode')
  @ApiOperation({
    summary: 'Validar acesso de um cliente a um produto',
    description: 'Endpoint principal para sistemas satélites. Retorna se o cliente pode usar o produto e quais features estão liberadas.',
  })
  validate(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Param('productCode') productCode: string,
  ) {
    return this.service.validate(customerId, productCode)
  }

  @Get('entitlements/:customerId')
  @ApiOperation({
    summary: 'Retorna todos os produtos/licenças de um cliente',
    description: 'Use para carregar o perfil completo de acesso do cliente em um único request.',
  })
  getEntitlements(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.service.getEntitlements(customerId)
  }
}
