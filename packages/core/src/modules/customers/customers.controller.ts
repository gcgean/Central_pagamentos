import {
  Controller, Get, Post, Put, Patch, Body, Param, Query,
  ParseUUIDPipe, HttpCode, HttpStatus, UseGuards
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger'
import { CustomersService } from './customers.service'
import { CreateCustomerDto } from './dto/create-customer.dto'
import { UpdateCustomerDto } from './dto/update-customer.dto'
import { ListCustomersDto } from './dto/list-customers.dto'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { Roles } from '../../shared/decorators/roles.decorator'
import { AuditAction } from '../../shared/decorators/audit.decorator'

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'customers', version: '1' })
export class CustomersController {

  constructor(private readonly service: CustomersService) {}

  @Post()
  @Roles('super_admin', 'financial', 'support', 'operations')
  @AuditAction('customer.create')
  @ApiOperation({ summary: 'Cadastrar novo cliente (PF ou PJ)' })
  @ApiResponse({ status: 201, description: 'Cliente criado com sucesso' })
  @ApiResponse({ status: 409, description: 'Documento já cadastrado' })
  create(@Body() dto: CreateCustomerDto) {
    return this.service.create(dto)
  }

  @Get()
  @ApiOperation({ summary: 'Listar clientes com filtros e paginação' })
  findAll(@Query() query: ListCustomersDto) {
    return this.service.findAll({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      status: query.status,
      search: query.search,
    })
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar cliente por ID' })
  @ApiResponse({ status: 404, description: 'Cliente não encontrado' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id)
  }

  @Get('by-document/:document')
  @ApiOperation({ summary: 'Buscar cliente por CPF ou CNPJ' })
  findByDocument(@Param('document') document: string) {
    return this.service.findByDocument(document)
  }

  @Put(':id')
  @Roles('super_admin', 'financial', 'support', 'operations')
  @AuditAction('customer.update')
  @ApiOperation({ summary: 'Atualizar dados do cliente' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.service.update(id, dto)
  }

  @Patch(':id/activate')
  @Roles('super_admin', 'operations')
  @AuditAction('customer.activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ativar cliente' })
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.activate(id)
  }

  @Patch(':id/block')
  @Roles('super_admin', 'operations', 'financial')
  @AuditAction('customer.block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquear cliente (não afeta produtos individuais)' })
  block(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('reason') reason: string,
  ) {
    return this.service.block(id, reason)
  }

  @Get(':id/products')
  @ApiOperation({ summary: 'Listar todos os produtos/licenças do cliente' })
  getProducts(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getProducts(id)
  }

  @Get(':id/licenses')
  @ApiOperation({ summary: 'Listar licenças do cliente' })
  getLicenses(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getLicenses(id)
  }
}
