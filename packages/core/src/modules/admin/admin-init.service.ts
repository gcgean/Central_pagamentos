import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { Inject } from '@nestjs/common'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'
import type { Sql } from 'postgres'
import { hash } from 'bcrypt'

@Injectable()
export class AdminInitService implements OnModuleInit {
  private readonly logger = new Logger(AdminInitService.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
  ) {}

  async onModuleInit() {
    this.logger.log('Verificando existência do usuário admin padrão...')
    try {
      await this.ensureDefaultAdmin()
    } catch (err) {
      this.logger.error('Falha ao inicializar o administrador padrão', err)
    }
  }

  private async ensureDefaultAdmin() {
    const adminEmail = 'gcgean@hotmail.com'
    const defaultPassword = 'csqwe123'
    const role = 'super_admin'

    // Verifica se já existe usando transação para garantir segurança
    await this.sql.begin(async (txInstance) => {
      const tx = txInstance as unknown as Sql
      const [existingAdmin] = await tx`
        SELECT id FROM admins WHERE email = ${adminEmail}
      `

      if (existingAdmin) {
        this.logger.log(`Usuário admin padrão (${adminEmail}) já existe. Pulando criação.`)
        return
      }

      this.logger.log(`Criando usuário admin padrão: ${adminEmail}`)
      
      const passwordHash = await hash(defaultPassword, 12)

      const [newAdmin] = await tx`
        INSERT INTO admins (
          name, 
          email, 
          password_hash, 
          role, 
          is_active, 
          must_change_password
        ) VALUES (
          'Admin Master', 
          ${adminEmail}, 
          ${passwordHash}, 
          ${role}, 
          true, 
          true
        )
        RETURNING id
      `

      // Registra evento de auditoria
      await tx`
        INSERT INTO audit_logs (
          actor_type, action, entity_type, entity_id, after_data, note
        ) VALUES (
          'system', 
          'admin.auto_create', 
          'admin', 
          ${newAdmin.id}, 
          ${tx.json({ email: adminEmail, role })}, 
          'Criação automática de admin padrão no startup'
        )
      `

      this.logger.log(`Administrador padrão criado com sucesso (ID: ${newAdmin.id})`)
    })
  }
}
