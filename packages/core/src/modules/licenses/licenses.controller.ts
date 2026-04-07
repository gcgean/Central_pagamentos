import {
  Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe,
  HttpCode, HttpStatus, UseGuards, Req
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { Roles, AuditAction } from '../../shared/guards/admin-jwt.guard'
import { LicensesService } from './licenses.service'
import { IsString, IsOptional, IsDateString, IsUUID, IsNumber, IsObject } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class EmitLicenseManualDto {
  @ApiProperty() @IsUUID() customerId: string
  @ApiProperty() @IsUUID() productId: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUsers?: number
  @ApiPropertyOptional() @IsOptional() @IsObject() featureSet?: Record<string, unknown>
  @ApiPropertyOptional() @IsOptional() @IsNumber() graceDays?: number
}

class SuspendLicenseDto {
  @ApiProperty({ example: 'Inadimplência confirmada' })
  @IsString()
  reason: string
}

class RevokeLicenseDto {
  @ApiProperty({ example: 'Fraude confirmada' })
  @IsString()
  reason: string
}

@ApiTags('licenses')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'licenses', version: '1' })
export class LicensesController {

  constructor(private readonly service: LicensesService) {}

  // Emissão manual de licença (ação administrativa)
  @Post('manual')
  @Roles('super_admin', 'operations')
  @AuditAction('license.emit_manual')
  @ApiOperation({
    summary: 'Emitir licença manualmente',
    description: 'Para casos excepcionais. Gera trilha de auditoria.'
  })
  emitManual(@Body() dto: EmitLicenseManualDto, @Req() req: any) {
    return this.service.emit({
      customerId: dto.customerId,
      productId: dto.productId,
      planId: dto.planId,
      originType: 'manual',
      originId: req.admin.sub,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      maxUsers: dto.maxUsers,
      featureSet: dto.featureSet,
      graceDays: dto.graceDays ?? 0,
      actorId: req.admin.sub,
      actorType: 'admin',
    })
  }

  @Get()
  @ApiOperation({ summary: 'Listar todas as licenças' })
  findAll() {
    return this.service.findAll()
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da licença' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id)
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Todas as licenças de um cliente' })
  findByCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.service.findAllByCustomer(customerId)
  }

  @Patch(':id/suspend')
  @Roles('super_admin', 'financial', 'operations', 'support')
  @AuditAction('license.suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Suspender licença manualmente' })
  suspend(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendLicenseDto,
    @Req() req: any,
  ) {
    return this.service.suspend(id, dto.reason, req.admin.sub, 'admin')
  }

  @Patch(':id/reactivate')
  @Roles('super_admin', 'financial', 'operations', 'support')
  @AuditAction('license.reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reativar licença suspensa' })
  reactivate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.reactivate(id, req.admin.sub, 'admin')
  }

  @Patch(':id/revoke')
  @Roles('super_admin')
  @AuditAction('license.revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revogar licença definitivamente (apenas super admin)' })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeLicenseDto,
    @Req() req: any,
  ) {
    return this.service.revoke(id, dto.reason, req.admin.sub)
  }
}
