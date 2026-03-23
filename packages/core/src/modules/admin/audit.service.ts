import { Injectable } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'

export interface AuditLogParams {
  actorType: 'admin' | 'system' | 'api' | 'webhook'
  actorId?: string
  actorLabel?: string
  action: string
  entityType: string
  entityId: string
  beforeData?: any
  afterData?: any
  ipAddress?: string
  userAgent?: string
  note?: string
}

@Injectable()
export class AuditService {

  constructor(@Inject(DATABASE_CONNECTION) private readonly sql: Sql) {}

  async log(params: AuditLogParams): Promise<void> {
    await this.sql`
      INSERT INTO audit_logs (
        actor_type, actor_id, actor_label, action,
        entity_type, entity_id,
        before_data, after_data,
        ip_address, user_agent, note
      ) VALUES (
        ${params.actorType}::actor_type,
        ${params.actorId ?? null},
        ${params.actorLabel ?? null},
        ${params.action},
        ${params.entityType},
        ${params.entityId},
        ${params.beforeData ? JSON.stringify(params.beforeData) : null},
        ${params.afterData ? JSON.stringify(params.afterData) : null},
        ${params.ipAddress ?? null},
        ${params.userAgent ?? null},
        ${params.note ?? null}
      )
    `.catch(err => {
      // Nunca deixar falha de auditoria quebrar o fluxo principal
      console.error('Falha ao registrar audit log:', err)
    })
  }

  async findByEntity(entityType: string, entityId: string, limit = 50) {
    return this.sql`
      SELECT * FROM audit_logs
      WHERE entity_type = ${entityType} AND entity_id = ${entityId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }

  async findByActor(actorId: string, limit = 100) {
    return this.sql`
      SELECT * FROM audit_logs
      WHERE actor_id = ${actorId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }

  async findRecent(limit = 200) {
    return this.sql`
      SELECT * FROM audit_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `
  }
}
