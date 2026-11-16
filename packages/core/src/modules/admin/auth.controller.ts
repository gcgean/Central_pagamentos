import {
  Controller, Post, Body, HttpCode, HttpStatus, UnauthorizedException,
  Inject, UseGuards, Req, Patch, BadRequestException, ServiceUnavailableException
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { IsEmail, IsString, MinLength, Matches, IsOptional, MaxLength, IsBoolean, IsUUID } from 'class-validator'
import { compare, hash } from 'bcrypt'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'
import { TwoFactorService, MENSAGEM_DO_MOTIVO, mascararEmail } from './two-factor.service'

class LoginDto {
  @ApiProperty({ example: 'admin@hub.local' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'hub@2025' })
  @IsString()
  @MinLength(6)
  password: string

  // Token de "confiar neste aparelho" guardado no navegador (dispensa o código).
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceToken?: string
}

class LoginCodeDto {
  @IsUUID()
  challengeId: string

  @Matches(/^\d{6}$/, { message: 'Digite os 6 números do código.' })
  code: string

  @IsOptional()
  @IsBoolean()
  trustDevice?: boolean
}

class ResendCodeDto {
  @IsUUID()
  challengeId: string
}

class ChangePasswordDto {
  @ApiProperty({ example: 'SenhaAtual123' })
  @IsString()
  currentPassword: string

  @ApiProperty({ example: 'NovaSenhaForte@2026' })
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter no mínimo 8 caracteres' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'A senha deve conter maiúsculas, minúsculas, números e caracteres especiais'
  })
  newPassword: string
}

import { ThrottlerGuard, Throttle } from '@nestjs/throttler'

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
@UseGuards(ThrottlerGuard)
export class AuthController {

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentativas por minuto
  @ApiOperation({ summary: 'Login do painel administrativo' })
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const [admin] = await this.sql`
      SELECT id, name, email, password_hash, role, is_active, must_change_password
      FROM admins
      WHERE email = ${dto.email}
    `

    if (!admin || !admin.is_active) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    const valid = await compare(dto.password, admin.password_hash)
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas')
    }

    // Verificação em duas etapas: aparelho que ainda não é de confiança recebe
    // um código por e-mail antes do token.
    if (
      this.twoFactor.ativa() &&
      !(await this.twoFactor.chaveDeIntegracaoValida(req?.headers?.['x-api-key'])) &&
      !(await this.twoFactor.aparelhoConfiavel(admin.id, dto.deviceToken))
    ) {
      const desafio = await this.twoFactor.criarDesafio(admin as any)
      if ('erro' in desafio) {
        throw new ServiceUnavailableException('Não foi possível enviar o código agora. Tente de novo em instantes.')
      }
      return {
        requires2fa: true,
        challengeId: desafio.id,
        emailMasked: mascararEmail(String(admin.email)),
        ...(desafio.previewCode ? { previewCode: desafio.previewCode } : {}),
      }
    }

    return this.concluirLogin(admin)
  }

  // Segundo passo do login: código certo libera o token.
  @Post('login/2fa')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Login do painel: confirma o código enviado por e-mail' })
  async loginCode(@Body() dto: LoginCodeDto, @Req() req: any) {
    // 400 e não 401: o painel trata 401 como sessão vencida e recarrega a página.
    const r = await this.twoFactor.conferir(dto.challengeId, dto.code)
    if (!r.ok) throw new BadRequestException(MENSAGEM_DO_MOTIVO[r.motivo])

    const [admin] = await this.sql`
      SELECT id, name, email, role, is_active, must_change_password FROM admins WHERE id = ${r.adminId}
    `
    if (!admin || !admin.is_active) throw new UnauthorizedException('Credenciais inválidas')

    const ua = String(req.headers?.['user-agent'] || '')
    const ip = String(req.ip || '')
    const deviceToken = dto.trustDevice ? await this.twoFactor.confiarNoAparelho(admin.id, ua, ip) : undefined
    this.twoFactor.avisarNovoAparelho(String(admin.email), ua, ip)

    return { ...(await this.concluirLogin(admin)), ...(deviceToken ? { deviceToken } : {}) }
  }

  // Reenviar o código (no máximo um por minuto).
  @Post('login/2fa/resend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Login do painel: reenvia o código por e-mail' })
  async resendCode(@Body() dto: ResendCodeDto) {
    const antigo = await this.twoFactor.desafioParaReenvio(dto.challengeId)
    if (!antigo) throw new BadRequestException('Volte e entre de novo com a senha.')
    if (antigo.segundos < 60) throw new BadRequestException('Aguarde um minuto para pedir outro código.')
    const [admin] = await this.sql`SELECT id, name, email, is_active FROM admins WHERE id = ${antigo.adminId}`
    if (!admin || !admin.is_active) throw new BadRequestException('Volte e entre de novo com a senha.')
    const desafio = await this.twoFactor.criarDesafio(admin as any)
    if ('erro' in desafio) {
      throw new ServiceUnavailableException('Não foi possível enviar o código agora. Tente de novo em instantes.')
    }
    return { challengeId: desafio.id, ...(desafio.previewCode ? { previewCode: desafio.previewCode } : {}) }
  }

  private async concluirLogin(admin: any) {
    await this.sql`
      UPDATE admins SET last_login_at = NOW() WHERE id = ${admin.id}
    `

    const token = this.jwt.sign(
      {
        sub: admin.id,
        email: admin.email,
        role: admin.role,
        type: 'admin',
        mustChangePassword: admin.must_change_password
      },
      { expiresIn: this.config.get('JWT_EXPIRY', '8h') }
    )

    return {
      accessToken: token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        mustChangePassword: admin.must_change_password
      },
    }
  }

  @Patch('change-password')
  @UseGuards(AdminJwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Alterar senha obrigatória ou voluntária' })
  async changePassword(@Body() dto: ChangePasswordDto, @Req() req: any) {
    const adminId = req.admin.sub

    const [admin] = await this.sql`
      SELECT id, password_hash FROM admins WHERE id = ${adminId}
    `

    if (!admin) {
      throw new UnauthorizedException('Admin não encontrado')
    }

    const valid = await compare(dto.currentPassword, admin.password_hash)
    if (!valid) {
      throw new BadRequestException('Senha atual incorreta')
    }

    const newHash = await hash(dto.newPassword, 12)

    await this.sql`
      UPDATE admins 
      SET 
        password_hash = ${newHash},
        must_change_password = false,
        updated_at = NOW()
      WHERE id = ${adminId}
    `

    return { message: 'Senha alterada com sucesso' }
  }
}
