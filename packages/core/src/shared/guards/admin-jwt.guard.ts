import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, ForbiddenException
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Reflector } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'

export const ROLES_KEY = 'roles'

@Injectable()
export class AdminJwtGuard implements CanActivate {

  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    const token = this.extractToken(request)
    if (!token) throw new UnauthorizedException('Token de autenticação ausente')

    let payload: any
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow('JWT_SECRET'),
      })
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado')
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Token não autorizado para este endpoint')
    }

    if (payload.mustChangePassword && !request.url.includes('/auth/change-password')) {
      throw new ForbiddenException('Troca de senha obrigatória pendente')
    }

    request.admin = payload

    // Verifica roles se @Roles() foi usado no controller
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (requiredRoles?.length) {
      const adminRole = payload.role
      if (!requiredRoles.includes(adminRole) && adminRole !== 'super_admin') {
        throw new ForbiddenException(
          `Perfil "${adminRole}" não tem permissão para esta ação. Requerido: ${requiredRoles.join(' ou ')}`
        )
      }
    }

    return true
  }

  private extractToken(request: any): string | null {
    const auth = request.headers?.authorization
    if (!auth?.startsWith('Bearer ')) return null
    return auth.slice(7)
  }
}

// ── roles.decorator.ts ────────────────────────────────────────────────────────
import { SetMetadata } from '@nestjs/common'
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)

// ── audit.decorator.ts ────────────────────────────────────────────────────────
// Decorator para marcar a ação de auditoria — o interceptor usa isso
export const AUDIT_KEY = 'audit_action'
export const AuditAction = (action: string) => SetMetadata(AUDIT_KEY, action)
