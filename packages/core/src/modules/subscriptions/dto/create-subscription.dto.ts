import { IsUUID, IsNumber, IsOptional, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreateSubscriptionDto {
  @ApiProperty() @IsUUID() customerId: string
  @ApiProperty() @IsUUID() productId: string
  @ApiProperty() @IsUUID() planId: string
  @ApiProperty() @IsNumber() @Min(0) contractedAmount: number
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsNumber() trialDays?: number = 0
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUsers?: number
  @ApiPropertyOptional() @IsOptional() featureSet?: Record<string, unknown>
}
