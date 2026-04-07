import {
  Injectable, NotFoundException, ConflictException, Logger
} from '@nestjs/common'
import { LicensesRepository } from './licenses.repository'
import { InternalEventsService } from '../webhooks/internal-events.service'
import { AuditService } from '../admin/audit.service'
import { License } from './entities/license.entity'
import dayjs from 'dayjs'
import { AccessCacheService } from '../../shared/cache/access-cache.service'

export interface EmitLicenseParams {
  customerId: string
  productId: string
  planId?: string
  originType: 'subscription' | 'order' | 'manual' | 'trial'
  originId: string
  startsAt?: Date
  expiresAt?: Date | null    // null = vitalício
  graceDays?: number
  maxUsers?: number
  featureSet?: Record<string, unknown>
  actorId?: string
  actorType?: string
}

@Injectable()
export class LicensesService {

  private readonly logger = new Logger(LicensesService.name)

  constructor(
    private readonly repo: LicensesRepository,
    private readonly internalEvents: InternalEventsService,
    private readonly audit: AuditService,
    private readonly accessCache: AccessCacheService,
  ) {}

  // ─── Emitir / Renovar licença ─────────────────────────────────────────────

  async emit(params: EmitLicenseParams): Promise<License> {
    const existing = await this.repo.findActiveByCustomerAndProduct(
      params.customerId, params.productId
    )

    // RN04: Cada produto tem licença independente
    // Se já existe, renovamos (update) ao invés de criar nova
    if (existing) {
      return this.renew(existing.id, params)
    }

    const startsAt = params.startsAt ?? new Date()
    const graceDays = params.graceDays ?? 7
    const graceUntil = params.expiresAt
      ? dayjs(params.expiresAt).add(graceDays, 'day').toDate()
      : null

    const license = await this.repo.create({
      customerId: params.customerId,
      productId: params.productId,
      planId: params.planId,
      originType: params.originType,
      originId: params.originId,
      status: 'active',
      startsAt,
      expiresAt: params.expiresAt ?? null,
      graceUntil,
      maxUsers: params.maxUsers,
      featureSet: params.featureSet ?? {},
    })

    this.logger.log(`Licença emitida: ${license.id} — cliente ${params.customerId} produto ${params.productId}`)

    // Dispara evento interno para o sistema satélite
    await this.internalEvents.dispatch({
      productId: params.productId,
      customerId: params.customerId,
      eventType: 'license.activated',
      payload: { licenseId: license.id, startsAt, expiresAt: params.expiresAt },
    })

    await this.audit.log({
      actorType: (params.actorType ?? 'system') as any,
      actorId: params.actorId,
      action: 'license.emit',
      entityType: 'license',
      entityId: license.id,
      afterData: license,
    })
    this.accessCache.invalidateStatus(params.customerId, params.productId)

    return license
  }

  async renew(licenseId: string, params: Partial<EmitLicenseParams>): Promise<License> {
    const license = await this.findById(licenseId)
    const graceDays = params.graceDays ?? 7

    const graceUntil = params.expiresAt
      ? dayjs(params.expiresAt).add(graceDays, 'day').toDate()
      : null

    const updated = await this.repo.update(licenseId, {
      status: 'active',
      startsAt: params.startsAt ?? license.startsAt,
      expiresAt: params.expiresAt !== undefined ? params.expiresAt : license.expiresAt,
      graceUntil,
      planId: params.planId ?? license.planId,
      maxUsers: params.maxUsers ?? license.maxUsers,
      featureSet: params.featureSet ?? license.featureSet,
      suspendedAt: null,
      suspendedReason: null,
    })

    this.logger.log(`Licença renovada: ${licenseId}`)

    await this.internalEvents.dispatch({
      productId: license.productId,
      customerId: license.customerId,
      eventType: 'license.renewed',
      payload: { licenseId, expiresAt: params.expiresAt },
    })
    this.accessCache.invalidateStatus(license.customerId, license.productId)

    return updated
  }

  // ─── Suspender (ex: inadimplência) ───────────────────────────────────────

  async suspend(licenseId: string, reason: string, actorId?: string, actorType = 'system'): Promise<License> {
    const license = await this.findById(licenseId)

    if (license.status === 'suspended') {
      return license // já está suspensa, idempotente
    }

    // Respeita grace_until antes de suspender
    if (license.graceUntil && dayjs().isBefore(license.graceUntil)) {
      this.logger.log(`Licença ${licenseId} em carência até ${license.graceUntil}, não suspensa`)
      return license
    }

    const updated = await this.repo.update(licenseId, {
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedReason: reason,
    })

    await this.internalEvents.dispatch({
      productId: license.productId,
      customerId: license.customerId,
      eventType: 'license.suspended',
      payload: { licenseId, reason },
    })

    await this.audit.log({
      actorType: actorType as any,
      actorId,
      action: 'license.suspend',
      entityType: 'license',
      entityId: licenseId,
      beforeData: license,
      afterData: updated,
    })
    this.accessCache.invalidateStatus(license.customerId, license.productId)

    return updated
  }

  // ─── Reativar ────────────────────────────────────────────────────────────

  async reactivate(licenseId: string, actorId?: string, actorType = 'admin'): Promise<License> {
    const license = await this.findById(licenseId)

    const updated = await this.repo.update(licenseId, {
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
    })

    await this.internalEvents.dispatch({
      productId: license.productId,
      customerId: license.customerId,
      eventType: 'license.reactivated',
      payload: { licenseId },
    })

    await this.audit.log({
      actorType: actorType as any,
      actorId,
      action: 'license.reactivate',
      entityType: 'license',
      entityId: licenseId,
      beforeData: license,
      afterData: updated,
    })
    this.accessCache.invalidateStatus(license.customerId, license.productId)

    return updated
  }

  // ─── Revogar ─────────────────────────────────────────────────────────────

  async revoke(licenseId: string, reason: string, actorId: string): Promise<License> {
    const license = await this.findById(licenseId)

    const updated = await this.repo.update(licenseId, {
      status: 'revoked',
      revokedAt: new Date(),
      revokedReason: reason,
    })

    await this.internalEvents.dispatch({
      productId: license.productId,
      customerId: license.customerId,
      eventType: 'license.revoked',
      payload: { licenseId, reason },
    })

    await this.audit.log({
      actorType: 'admin',
      actorId,
      action: 'license.revoke',
      entityType: 'license',
      entityId: licenseId,
      beforeData: license,
      afterData: updated,
    })
    this.accessCache.invalidateStatus(license.customerId, license.productId)

    return updated
  }

  // ─── Consultas ────────────────────────────────────────────────────────────

  async findById(id: string): Promise<License> {
    const license = await this.repo.findById(id)
    if (!license) throw new NotFoundException(`Licença ${id} não encontrada`)
    return license
  }

  async findByCustomerAndProduct(customerId: string, productId: string): Promise<License | null> {
    return this.repo.findActiveByCustomerAndProduct(customerId, productId)
  }

  async findAll(): Promise<License[]> {
    return this.repo.findAll()
  }

  async findAllByCustomer(customerId: string): Promise<License[]> {
    return this.repo.findAllByCustomer(customerId)
  }

  // Retorna qualquer licença de trial (qualquer status) para verificar se trial já foi usado
  async findTrialByCustomerAndProduct(customerId: string, productId: string): Promise<License | null> {
    return this.repo.findTrialByCustomerAndProduct(customerId, productId)
  }

  // ─── Rotina: expirar licenças vencidas ───────────────────────────────────

  async expireOverdueLicenses(): Promise<number> {
    const now = new Date()
    const expired = await this.repo.findExpiredAfterGrace(now)

    let count = 0
    for (const license of expired) {
      await this.suspend(license.id, 'Licença expirada após carência')
      count++
    }

    this.logger.log(`${count} licenças expiradas processadas`)
    return count
  }
}
