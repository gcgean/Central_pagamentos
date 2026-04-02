import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { ApiBody, ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { ApiKeyGuard } from '../../shared/guards/api-key.guard'
import { AccessService } from './access.service'
import {
  AccessStatusResponseDto,
  ResolveAccessDto,
  ResolveAccessResponseDto,
} from './dto/resolve-access.dto'
import { PlansService } from '../plans/plans.service'

@ApiTags('access')
@ApiSecurity('api-key')
@UseGuards(ThrottlerGuard, ApiKeyGuard)
@Controller({ path: 'access', version: '1' })
export class AccessController {

  constructor(
    private readonly service: AccessService,
    private readonly plans: PlansService,
  ) {}

  // ─── Endpoint legado — mantido para retrocompatibilidade ──────────────────

  @Get('customer/:customerId/product/:productCode')
  @ApiOperation({
    summary: 'Validar acesso de um cliente a um produto',
    description:
      'Endpoint principal para sistemas satélites. Retorna se o cliente pode usar o produto e quais features estão liberadas.',
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

  // ─── POST /access/resolve ─────────────────────────────────────────────────

  @Post('resolve')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Resolver acesso completo por documento e produto',
    description: `
Fluxo centralizado de onboarding e controle de acesso para sistemas satélites.

**O que este endpoint faz:**
1. Localiza o cliente pelo CPF/CNPJ normalizado (cria se não existir)
2. Verifica se há licença paga ativa → retorna \`licensed\`
3. Verifica trial existente:
   - Ativo → retorna \`trial\`
   - Expirado → retorna \`blocked\` com reason \`trial_expired\`
4. Sem trial anterior → inicia trial automaticamente se \`trial_days > 0\` no produto
5. Sem trial configurado → retorna \`no_license\`

**Garantias:**
- Trial é concedido apenas uma vez por customer + product
- Cliente único por CPF/CNPJ (sem duplicação)
- Idempotente: múltiplas chamadas com mesmo documento retornam o mesmo cliente

**access_status possíveis:**
- \`trial\` — em período de avaliação gratuita
- \`licensed\` — licença paga ativa (ou em carência)
- \`blocked\` — acesso negado (trial expirado, suspensão, bloqueio manual)
- \`no_license\` — sem trial configurado e sem licença
    `.trim(),
  })
  @ApiBody({ type: ResolveAccessDto })
  @ApiResponse({ status: 201, type: ResolveAccessResponseDto, description: 'Resolução concluída' })
  @ApiResponse({ status: 401, description: 'API Key ausente ou inválida' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  resolveAccess(@Body() dto: ResolveAccessDto): Promise<ResolveAccessResponseDto> {
    return this.service.resolveAccess(dto)
  }

  // ─── GET /access/status ───────────────────────────────────────────────────

  @Get('status')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({
    summary: 'Consultar status consolidado de acesso',
    description: `
Retorna o estado atual de acesso de um cliente a um produto.

Diferente de \`POST /access/resolve\`, este endpoint **não cria clientes nem inicia trials**.
Use-o para consultas periódicas após o onboarding inicial.

**Valores de reason:**
- \`trial_active\` — trial em andamento
- \`trial_expired\` — trial encerrado sem conversão
- \`licensed\` — licença paga ativa
- \`grace_period\` — dentro do período de carência pós-expiração
- \`license_suspended\` — licença suspensa por inadimplência
- \`license_expired\` — licença vencida após carência
- \`license_revoked\` — licença revogada manualmente
- \`no_license\` — nenhum vínculo encontrado
- \`customer_not_found\` / \`customer_blocked\` / \`product_not_found\`
    `.trim(),
  })
  @ApiQuery({ name: 'customerId', required: true, example: '2db2626d-4e1d-4ff3-a898-152a37a883d9' })
  @ApiQuery({ name: 'productId', required: true, example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({ status: 200, type: AccessStatusResponseDto })
  @ApiResponse({ status: 401, description: 'API Key ausente ou inválida' })
  getAccessStatus(
    @Query('customerId', ParseUUIDPipe) customerId: string,
    @Query('productId', ParseUUIDPipe) productId: string,
  ): Promise<AccessStatusResponseDto> {
    return this.service.getAccessStatus(customerId, productId)
  }

  @Get('products/:productId/plans')
  @ApiOperation({
    summary: 'Listar planos públicos de um produto (API Key)',
    description: 'Endpoint para o satélite montar tela de planos usando dados oficiais do Hub.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'archived', 'draft'] })
  @ApiQuery({ name: 'includeArchived', required: false, example: 'false' })
  async getPublicPlans(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Query('status') status?: string,
    @Query('includeArchived') includeArchived?: string,
    @Req() req?: any,
  ) {
    const integrationProductId = req?.productId
    if (integrationProductId && integrationProductId !== productId) {
      throw new ForbiddenException('API Key sem permissão para este produto.')
    }

    const include = includeArchived === undefined
      ? false
      : String(includeArchived).toLowerCase() === 'true'

    const plans = await this.plans.findByProduct(productId, {
      status,
      includeArchived: include,
    })

    return plans.map((plan: any) => ({
      id: plan.id,
      productId: plan.productId,
      code: plan.code,
      name: plan.name,
      description: plan.description ?? null,
      amount: plan.amount,
      currency: plan.currency,
      intervalUnit: plan.intervalUnit,
      intervalCount: plan.intervalCount,
      status: plan.status,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    }))
  }
}
