import {
  Controller, Post, Body, HttpCode, HttpStatus, UnauthorizedException
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'
import { compare } from 'bcrypt'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

class LoginDto {
  @ApiProperty({ example: 'admin@hub.local' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'hub@2025' })
  @IsString()
  @MinLength(6)
  password: string
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login do painel administrativo' })
  async login(@Body() dto: LoginDto) {
    const [admin] = await this.sql`
      SELECT id, name, email, password_hash, role, is_active
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
      { sub: admin.id, email: admin.email, role: admin.role, type: 'admin' },
      { expiresIn: this.config.get('JWT_EXPIRY', '8h') }
    )

    return {
      accessToken: token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    }
  }
}
