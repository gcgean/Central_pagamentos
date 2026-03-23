import { IsString, IsBoolean, IsOptional, IsEnum, MinLength, MaxLength, Matches } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export enum ProductBillingType {
  RECURRING = 'recurring',
  ONE_TIME   = 'one_time',
  HYBRID     = 'hybrid',
}

export enum ProductStatus {
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
  DRAFT    = 'draft',
}

export class CreateProductDto {
  @ApiProperty({ example: 'CRM_PRO', description: 'Código único do produto (slug)' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[A-Z0-9_-]+$/, { message: 'Código deve conter apenas letras maiúsculas, números, underscores e hífens' })
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

  @ApiPropertyOptional({ enum: ProductBillingType, default: ProductBillingType.RECURRING })
  @IsOptional()
  @IsEnum(ProductBillingType)
  billingType?: ProductBillingType = ProductBillingType.RECURRING

  @ApiPropertyOptional({ enum: ProductStatus, default: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus

  @ApiPropertyOptional({ default: true, description: 'Atalho para status=active/inactive' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
