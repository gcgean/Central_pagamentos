// ── subscriptions.controller.ts ───────────────────────────────────────────────
import {
  Controller, Get, Post, Patch, Body, Param, ParseUUIDPipe,
  HttpCode, HttpStatus, UseGuards, Req
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { Roles, AuditAction } from '../../shared/guards/admin-jwt.guard'
import { SubscriptionsService } from './subscriptions.service'
import { CheckoutService } from '../payments/checkout.service'
import { IsUUID, IsString, IsBoolean, IsOptional, IsNumber, Min, IsIn } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

class CreateSubscriptionDto {
  @ApiProperty() @IsUUID() customerId: string
  @ApiProperty() @IsUUID() productId: string
  @ApiProperty() @IsUUID() planId: string
  @ApiProperty() @IsNumber() @Min(0) contractedAmount: number
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() trialDays?: number
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUsers?: number
  @ApiPropertyOptional() @IsOptional() featureSet?: Record<string, unknown>
}

class CancelSubscriptionDto {
  @ApiProperty() @IsString() reason: string
  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean() immediate?: boolean
}

class ChangePlanDto {
  @ApiProperty() @IsUUID() planId: string
  @ApiProperty() @IsNumber() @Min(0) amount: number
}

class CreateCheckoutDto {
  @ApiProperty({ enum: ['PIX', 'CREDIT_CARD'] })
  @IsIn(['PIX', 'CREDIT_CARD'])
  billingType: 'PIX' | 'CREDIT_CARD'

  @ApiPropertyOptional() @IsOptional() @IsNumber() installmentCount?: number

  @ApiPropertyOptional({ description: 'Nome do titular (obrigatório para PIX quando cliente não possui nome/documento válido)' })
  @IsOptional() @IsString()
  payerName?: string

  @ApiPropertyOptional({ description: 'CPF/CNPJ do titular (11 ou 14 dígitos). Obrigatório para PIX quando cliente não possui documento válido.' })
  @IsOptional() @IsString()
  payerDocument?: string
}

class CreateOrderDto {
  @ApiProperty() @IsUUID() customerId: string
  @ApiProperty() @IsUUID() productId: string
  @ApiPropertyOptional() @IsOptional() @IsUUID() planId?: string

  @ApiPropertyOptional({ description: 'Valor contratado em centavos (inteiro)' })
  @IsOptional() @IsNumber() @Min(0.01)
  contractedAmount?: number

  @ApiPropertyOptional({ description: 'Alias de compatibilidade para contractedAmount. Decimais serão convertidos para centavos.' })
  @IsOptional() @IsNumber() @Min(0.01)
  amount?: number

  @ApiPropertyOptional({ default: 'BRL' })
  @IsOptional() @IsString()
  contractedCurrency?: string
}

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'subscriptions', version: '1' })
export class SubscriptionsController {

  constructor(
    private readonly service: SubscriptionsService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post()
  @Roles('super_admin', 'financial', 'operations')
  @AuditAction('subscription.create')
  @ApiOperation({ summary: 'Criar nova assinatura' })
  create(@Body() dto: CreateSubscriptionDto, @Req() req: any) {
    return this.service.create(dto, req.admin?.sub)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da assinatura' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findById(id)
  }

  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Todas as assinaturas de um cliente' })
  findByCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.service.findByCustomer(customerId)
  }

  @Post(':id/checkout')
  @Roles('super_admin', 'financial', 'operations')
  @ApiOperation({ summary: 'Gerar cobrança / link de pagamento para assinatura' })
  createCheckout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCheckoutDto,
    @Req() req: any,
  ) {
    // Injeta contexto da assinatura antes de criar o checkout
    return this.service.findById(id).then(sub =>
      this.checkout.createCheckout({
        customerId: sub.customerId,
        productId: sub.productId,
        planId: sub.planId,
        originType: 'subscription',
        originId: id,
        ...dto,
        remoteIp: req.ip,
      })
    )
  }

  @Patch(':id/cancel')
  @Roles('super_admin', 'financial', 'operations')
  @AuditAction('subscription.cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar assinatura' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSubscriptionDto,
    @Req() req: any,
  ) {
    return this.service.cancel(id, dto.reason, dto.immediate ?? false, req.admin?.sub)
  }

  @Patch(':id/change-plan')
  @Roles('super_admin', 'financial')
  @AuditAction('subscription.change_plan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer upgrade ou downgrade de plano' })
  changePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangePlanDto,
    @Req() req: any,
  ) {
    return this.service.changePlan(id, dto.planId, dto.amount, req.admin?.sub)
  }
}

// ── orders.controller.ts ──────────────────────────────────────────────────────
import { OrdersService } from '../orders/orders.service'

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller({ path: 'orders', version: '1' })
export class OrdersController {

  constructor(
    private readonly orders: OrdersService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post()
  @Roles('super_admin', 'financial', 'operations')
  @AuditAction('order.create')
  @ApiOperation({ summary: 'Criar pedido avulso para checkout (incluindo conversão de trial)' })
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do pedido' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findById(id)
  }

  @Post(':id/checkout')
  @Roles('super_admin', 'financial', 'operations')
  @ApiOperation({ summary: 'Gerar link de pagamento para pedido avulso' })
  createCheckout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCheckoutDto,
    @Req() req: any,
  ) {
    return this.orders.findById(id).then(order =>
      this.checkout.createCheckout({
        customerId: order.customerId,
        productId: order.productId,
        planId: order.planId,
        originType: 'order',
        originId: id,
        ...dto,
        remoteIp: req.ip,
      })
    )
  }

  @Patch(':id/cancel')
  @AuditAction('order.cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body('reason') reason: string, @Req() req: any) {
    return this.orders.cancel(id, reason, req.admin?.sub)
  }
}
