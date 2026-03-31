import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsEnum, IsString, IsUUID, MinLength } from 'class-validator'

export enum AccessPersonType {
  PF = 'PF',
  PJ = 'PJ',
}

// ─── Request ──────────────────────────────────────────────────────────────────

export class ResolveAccessDto {
  @ApiProperty({
    example: '123.456.789-09',
    description: 'CPF (PF) ou CNPJ (PJ) do cliente. Será normalizado automaticamente.',
  })
  @IsString()
  @MinLength(11)
  document: string

  @ApiProperty({ enum: AccessPersonType, example: 'PF' })
  @IsEnum(AccessPersonType)
  personType: AccessPersonType

  @ApiProperty({
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    description: 'UUID do produto para o qual o acesso está sendo resolvido.',
  })
  @IsUUID()
  productId: string

  @ApiProperty({
    example: 'Maria Oliveira',
    description: 'Nome completo ou Razão Social. Usado apenas na criação de novo cliente.',
  })
  @IsString()
  @MinLength(2)
  name: string

  @ApiProperty({ example: 'maria@exemplo.com.br' })
  @IsEmail()
  email: string
}

// ─── Response ─────────────────────────────────────────────────────────────────

export type AccessStatus = 'trial' | 'licensed' | 'blocked' | 'no_license'

export class ResolveAccessResponseDto {
  @ApiProperty({ example: '2db2626d-4e1d-4ff3-a898-152a37a883d9' })
  customerId: string

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  productId: string

  @ApiPropertyOptional({ example: 'f0e1d2c3-b4a5-6789-cdef-012345678901', nullable: true })
  licenseId: string | null

  @ApiProperty({
    enum: ['trial', 'licensed', 'blocked', 'no_license'],
    example: 'trial',
    description:
      'trial = em período de avaliação | licensed = licença paga ativa | ' +
      'blocked = trial expirado ou licença vencida/suspensa | no_license = sem trial configurado e sem licença',
  })
  accessStatus: AccessStatus

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z', nullable: true })
  trialStartedAt: string | null

  @ApiPropertyOptional({ example: '2026-01-15T23:59:59.000Z', nullable: true })
  trialEndAt: string | null

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', nullable: true })
  licenseEndAt: string | null

  @ApiPropertyOptional({ example: 12, nullable: true, description: 'Dias restantes (trial ou licença).' })
  daysLeft: number | null

  @ApiProperty({
    example: 'trial_active',
    description:
      'Motivo detalhado da decisão. Ex.: trial_active, trial_expired, licensed, grace_period, ' +
      'license_suspended, license_expired, license_revoked, no_license, customer_blocked, customer_not_found, product_not_found.',
  })
  reason: string

  @ApiPropertyOptional({
    description: 'Features liberadas para o cliente no contexto atual do produto.',
    example: { max_users: 5, modules: ['dashboard', 'reports'] },
    nullable: true,
  })
  features: Record<string, unknown> | null

  @ApiProperty({ example: true })
  canAccess: boolean

  @ApiPropertyOptional({
    example: 'Você está no período de avaliação gratuita. Restam 12 dias.',
    nullable: true,
    description: 'Mensagem pronta para exibição na UI do sistema satélite.',
  })
  banner: string | null
}

// ─── GET /access/status response ──────────────────────────────────────────────

export class AccessStatusResponseDto {
  @ApiProperty({ example: '2db2626d-4e1d-4ff3-a898-152a37a883d9' })
  customerId: string

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  productId: string

  @ApiPropertyOptional({ example: 'f0e1d2c3-b4a5-6789-cdef-012345678901', nullable: true })
  licenseId: string | null

  @ApiProperty({ enum: ['trial', 'licensed', 'blocked', 'no_license'], example: 'licensed' })
  accessStatus: AccessStatus

  @ApiProperty({ example: true })
  canAccess: boolean

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z', nullable: true })
  trialStartedAt: string | null

  @ApiPropertyOptional({ example: '2026-01-15T23:59:59.000Z', nullable: true })
  trialEndAt: string | null

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z', nullable: true })
  licenseEndAt: string | null

  @ApiPropertyOptional({ example: 45, nullable: true })
  daysLeft: number | null

  @ApiProperty({
    example: 'licensed',
    description:
      'Motivo detalhado da situação. Valores: trial_active | trial_expired | licensed | ' +
      'grace_period | license_suspended | license_expired | license_revoked | no_license | ' +
      'customer_blocked | customer_not_found | product_not_found',
  })
  reason: string

  @ApiPropertyOptional({
    description: 'Features liberadas para o cliente no contexto atual do produto.',
    example: { max_users: 5, modules: ['dashboard', 'reports'] },
    nullable: true,
  })
  features: Record<string, unknown> | null

  @ApiPropertyOptional({ example: null, nullable: true })
  banner: string | null
}
