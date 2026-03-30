// ── customers.module.ts ──────────────────────────────────────────────────────
import { Module } from '@nestjs/common'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'
import { CustomersRepository } from './customers.repository'

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomersRepository],
  exports: [CustomersService, CustomersRepository],
})
export class CustomersModule {}
