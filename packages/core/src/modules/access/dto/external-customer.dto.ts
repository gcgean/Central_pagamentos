import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsEnum, IsOptional, IsString, Length, MinLength, ValidateIf } from 'class-validator'

export enum ExternalPersonType {
  PF = 'PF',
  PJ = 'PJ',
}

export class ResolveExternalCustomerDto {
  @ApiPropertyOptional({ example: '123.456.789-09' })
  @IsOptional()
  @IsString()
  document?: string

  @ApiPropertyOptional({ example: 'contato@empresa.com.br' })
  @IsOptional()
  @IsEmail()
  email?: string
}

export class UpsertExternalCustomerDto {
  @ApiProperty({ enum: ExternalPersonType, example: 'PJ' })
  @IsEnum(ExternalPersonType)
  personType: ExternalPersonType

  @ApiProperty({ example: '12.345.678/0001-90' })
  @IsString()
  @MinLength(11)
  document: string

  @ApiProperty({ example: 'Empresa Exemplo LTDA' })
  @IsString()
  @MinLength(2)
  legalName: string

  @ApiProperty({ example: 'financeiro@empresa.com.br' })
  @IsEmail()
  email: string

  @ApiPropertyOptional({ example: '(11) 99999-9999' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  phone?: string

  @ApiPropertyOptional({ example: '60000-000' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  addressZip?: string

  @ApiPropertyOptional({ example: 'Rua Principal' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  addressStreet?: string

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  addressNumber?: string

  @ApiPropertyOptional({ example: 'Sala 100' })
  @IsOptional()
  @IsString()
  addressComp?: string

  @ApiPropertyOptional({ example: 'Centro' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  addressDistrict?: string

  @ApiPropertyOptional({ example: 'Fortaleza' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  addressCity?: string

  @ApiPropertyOptional({ example: 'CE' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  addressState?: string

  @ApiPropertyOptional({ example: 'Integração ERP X' })
  @IsOptional()
  @IsString()
  notes?: string

  @ApiPropertyOptional({ example: 'req-erp-12345' })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.idempotencyKey === undefined || o.idempotencyKey === null)
  idempotencyKey?: string
}

export class ExternalCustomerResponseDto {
  @ApiProperty({ example: true })
  exists: boolean

  @ApiProperty({ example: 'existing' })
  source: 'existing' | 'created'

  @ApiProperty({ example: '2db2626d-4e1d-4ff3-a898-152a37a883d9', nullable: true })
  customerId: string | null
}
