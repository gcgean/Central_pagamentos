import { BadRequestException, Body, Controller, Get, Headers, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiKeyGuard } from '../../shared/guards/api-key.guard'
import {
  ExternalCustomerResponseDto,
  ResolveExternalCustomerDto,
  UpsertExternalCustomerDto,
} from './dto/external-customer.dto'
import { ExternalCustomersService } from './external-customers.service'

@ApiTags('access-customers')
@ApiSecurity('api-key')
@UseGuards(ThrottlerGuard, ApiKeyGuard)
@Controller({ path: 'access/customers', version: '1' })
export class ExternalCustomersController {
  constructor(private readonly service: ExternalCustomersService) {}

  @Get('resolve')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resolver cliente por documento ou e-mail',
    description: 'Endpoint para integração externa verificar se cliente já existe no Hub Billing.',
  })
  @ApiQuery({ name: 'document', required: false, example: '12.345.678/0001-90' })
  @ApiQuery({ name: 'email', required: false, example: 'contato@empresa.com.br' })
  @ApiResponse({ status: 200, type: ExternalCustomerResponseDto })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos' })
  async resolve(@Query() query: ResolveExternalCustomerDto): Promise<ExternalCustomerResponseDto> {
    return this.service.resolve(query) as Promise<ExternalCustomerResponseDto>
  }

  @Post('upsert')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Criar cliente idempotente para integração externa',
    description: 'Se já existir por documento/e-mail, retorna o ID existente. Se não, cria e retorna o novo ID.',
  })
  @ApiResponse({ status: 201, description: 'Cliente criado com sucesso', type: ExternalCustomerResponseDto })
  @ApiResponse({ status: 200, description: 'Cliente já existente', type: ExternalCustomerResponseDto })
  @ApiResponse({ status: 400, description: 'Validação de campos obrigatórios ou documento inválido' })
  @ApiResponse({ status: 401, description: 'API key ausente/inválida/desativada' })
  @ApiBody({
    type: UpsertExternalCustomerDto,
    examples: {
      pj: {
        summary: 'Pessoa Jurídica',
        value: {
          personType: 'PJ',
          document: '12.345.678/0001-90',
          legalName: 'Empresa Exemplo LTDA',
          email: 'financeiro@empresa.com.br',
          phone: '(11) 99999-9999',
          addressZip: '60000-000',
          addressStreet: 'Rua Central',
          addressNumber: '100',
          addressDistrict: 'Centro',
          addressCity: 'Fortaleza',
          addressState: 'CE',
        },
      },
    },
  })
  async upsert(
    @Body() dto: UpsertExternalCustomerDto,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Res({ passthrough: true }) res?: any,
  ): Promise<ExternalCustomerResponseDto> {
    if (idempotencyKey && idempotencyKey.length > 120) {
      throw new BadRequestException('idempotency-key muito longa.')
    }
    const result = await this.service.upsert({
      ...dto,
      idempotencyKey: idempotencyKey ?? dto.idempotencyKey,
    })
    if (result.source === 'existing' && res) {
      res.statusCode = 200
    }
    return result as ExternalCustomerResponseDto
  }
}
