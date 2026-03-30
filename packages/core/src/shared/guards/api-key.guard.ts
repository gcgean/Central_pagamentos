import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { createHash } from 'crypto'
import { IntegrationsRepository } from '../../modules/integrations/integrations.repository'

// Guard para sistemas satélites — autenticação via x-api-key
@Injectable()
export class ApiKeyGuard implements CanActivate {

  constructor(private readonly integrations: IntegrationsRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const headerValue = request.headers['x-api-key']
    const apiKey = Array.isArray(headerValue) ? headerValue[0] : headerValue

    if (!apiKey) {
      throw new UnauthorizedException('API key ausente. Inclua o header x-api-key.')
    }

    // Hash da key para busca segura (nunca armazenamos a key em plain text)
    const keyHash = createHash('sha256').update(apiKey).digest('hex')
    const integration = await this.integrations.findByKeyHash(keyHash)
    const isActive = Boolean(integration?.isActive ?? integration?.is_active)

    if (!integration || !isActive) {
      throw new UnauthorizedException('API key inválida ou desativada.')
    }

    // Verifica whitelist de IP se configurada
    if (integration.ipWhitelist?.length > 0) {
      const clientIp = request.ip ?? request.headers['x-forwarded-for']
      if (!integration.ipWhitelist.includes(clientIp)) {
        throw new UnauthorizedException('IP não autorizado.')
      }
    }

    // Atualiza last_used_at de forma não bloqueante
    this.integrations.updateLastUsed(integration.id).catch(() => {})

    // Anexa ao request para uso nos controllers
    request.integration = integration
    request.productId = integration.productId ?? integration.product_id

    return true
  }
}
