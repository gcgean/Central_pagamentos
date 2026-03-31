import { Injectable } from '@nestjs/common'
import { AccessStatusResponseDto } from '../../modules/access/dto/resolve-access.dto'

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

@Injectable()
export class AccessCacheService {
  private readonly ttlMs = 60_000
  private readonly statusCache = new Map<string, CacheEntry<AccessStatusResponseDto>>()

  buildStatusKey(customerId: string, productId: string): string {
    return `${customerId}:${productId}`
  }

  getStatus(key: string): AccessStatusResponseDto | null {
    const entry = this.statusCache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.statusCache.delete(key)
      return null
    }
    return entry.value
  }

  setStatus(key: string, value: AccessStatusResponseDto): void {
    this.statusCache.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  invalidateStatus(customerId: string, productId: string): void {
    this.statusCache.delete(this.buildStatusKey(customerId, productId))
  }

  invalidateCustomer(customerId: string): void {
    for (const key of this.statusCache.keys()) {
      if (key.startsWith(`${customerId}:`)) {
        this.statusCache.delete(key)
      }
    }
  }
}
