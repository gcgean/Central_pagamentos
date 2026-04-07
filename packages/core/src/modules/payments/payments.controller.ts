import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { PaymentsService } from './payments.service'

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {

  constructor(private readonly service: PaymentsService) {}

  @Get('charges')
  @ApiOperation({ summary: 'Listar cobranças por origem (assinatura ou pedido)' })
  listByOrigin(
    @Query('originType') originType: string,
    @Query('originId') originId: string,
  ) {
    return this.service.listByOrigin(originType, originId)
  }

  @Get('charges/:externalId')
  @ApiOperation({ summary: 'Consultar cobrança no gateway' })
  getCharge(@Param('externalId') externalId: string) {
    return this.service.getCharge(externalId)
  }

  @Post('charges/:externalId/refund')
  @ApiOperation({ summary: 'Reembolsar cobrança' })
  refund(@Param('externalId') externalId: string, @Body('value') value?: number) {
    return this.service.refund(externalId, value)
  }

  @Post('charges/:externalId/cancel')
  @ApiOperation({ summary: 'Cancelar cobrança no gateway' })
  cancel(@Param('externalId') externalId: string) {
    return this.service.cancelCharge(externalId)
  }

  @Post('sync-pending')
  @ApiOperation({ summary: 'Forçar sincronização em lote de cobranças pendentes (Mercado Pago)' })
  syncPending(
    @Query('limit') limit?: string,
    @Query('delayMs') delayMs?: string,
  ) {
    const parsedLimit = Number(limit)
    const parsedDelay = Number(delayMs)
    const safeLimit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
    const safeDelay = Number.isFinite(parsedDelay) ? Math.min(Math.max(parsedDelay, 0), 2000) : 350
    return this.service.syncPendingMercadoPagoChargesBatchThrottled(safeLimit, safeDelay)
  }
}
