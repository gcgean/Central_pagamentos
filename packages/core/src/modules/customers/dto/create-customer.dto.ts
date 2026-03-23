import { IsEnum, IsEmail, IsString, IsOptional, MinLength, MaxLength, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export enum PersonType { PF = 'PF', PJ = 'PJ' }

export class CreateCustomerDto {
  @ApiProperty({ enum: PersonType, example: 'PJ' })
  @IsEnum(PersonType)
  personType: PersonType

  @ApiProperty({ example: '12.345.678/0001-90', description: 'CPF ou CNPJ (aceita formatado ou somente dígitos)' })
  @IsString()
  @MinLength(11)
  @MaxLength(18)
  document: string

  @ApiProperty({ example: 'Clínica Saúde Ltda', description: 'Nome completo ou Razão Social' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  legalName: string

  @ApiPropertyOptional({ example: 'Clínica Saúde', description: 'Nome Fantasia (PJ)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradeName?: string

  @ApiProperty({ example: 'contato@clinicasaude.com.br' })
  @IsEmail()
  email: string

  @ApiPropertyOptional({ example: '(85) 99999-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string

  @ApiPropertyOptional({ example: '60000-000' })
  @IsOptional()
  @IsString()
  addressZip?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressStreet?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  addressNumber?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressComp?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressDistrict?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  addressCity?: string

  @ApiPropertyOptional({ example: 'CE' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  addressState?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string
}
