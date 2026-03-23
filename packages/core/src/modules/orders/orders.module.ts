import { Module } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { AdminModule } from '../admin/admin.module'

@Module({
  imports: [AdminModule],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
