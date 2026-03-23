import { IsString, IsBoolean, IsOptional, MinLength, MaxLength, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateProductDto {
  @ApiProperty({ example: 'CRM_PRO', description: 'Código único do produto (slug)' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_]+$/, { message: 'Código deve conter apenas letras maiúsculas, números e underscores' })
  code: string

  @ApiProperty({ example: 'CRM Pro' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string

  @ApiPropertyOptional({ example: 'Sistema CRM para gestão de clientes' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true
}
