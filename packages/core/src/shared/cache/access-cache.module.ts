import { Global, Module } from '@nestjs/common'
import { AccessCacheService } from './access-cache.service'

@Global()
@Module({
  providers: [AccessCacheService],
  exports: [AccessCacheService],
})
export class AccessCacheModule {}
