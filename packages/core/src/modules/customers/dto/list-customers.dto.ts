import { IsOptional, IsInt, Min, Max, IsIn, IsString, MaxLength } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

export class ListCustomersDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'blocked'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'blocked'])
  status?: string

  @ApiPropertyOptional({ description: 'Busca por nome, email ou documento' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string
}
