import {
  Controller, Post, Body, HttpCode, HttpStatus, UnauthorizedException,
  Inject, UseGuards, Req, Patch, BadRequestException
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiProperty, ApiBearerAuth } from '@nestjs/swagger'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { IsEmail, IsString, MinLength, Matches } from 'class-validator'
import { compare, hash } from 'bcrypt'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { AdminJwtGuard } from '../../shared/guards/admin-jwt.guard'

class LoginDto {
  @ApiProperty({ example: 'admin@hub.local' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'hub@2025' })
  @IsString()
  @MinLength(6)
  password: string
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
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 tentativas por minuto
  @ApiOperation({ summary: 'Login do painel administrativo' })
  async login(@Body() dto: LoginDto) {
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
