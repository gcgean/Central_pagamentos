import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Sql } from 'postgres'
import { compare, hash } from 'bcrypt'
import { createHash, randomBytes, randomInt } from 'crypto'
import { DATABASE_CONNECTION } from '../../shared/database/database.module'

// Verificação em duas etapas do painel (16/11/2026), no mesmo modelo do
// NoSigilo: código de 6 dígitos por e-mail, 10 minutos, 5 tentativas;
// "confiar neste aparelho" dispensa o código por 30 dias naquele navegador.
const CODIGO_MINUTOS = 10
const CODIGO_TENTATIVAS = 5
const APARELHO_DIAS = 30

export type MotivoFalha = 'invalido' | 'expirado' | 'esgotado'

export const MENSAGEM_DO_MOTIVO: Record<MotivoFalha, string> = {
  invalido: 'Código incorreto. Confira e tente de novo.',
  expirado: 'Este código expirou. Peça um novo.',
  esgotado: 'Muitas tentativas erradas. Peça um novo código.',
}

const hashAparelho = (token: string) => createHash('sha256').update(token).digest('hex')

export function mascararEmail(email: string) {
  const [nome, dominio] = email.split('@')
  if (!dominio) return email
  return `${nome.slice(0, 2)}${'*'.repeat(Math.max(1, nome.length - 2))}@${dominio}`
}

/** "Chrome no Windows", "Safari no iPhone": o bastante para reconhecer o aparelho. */
export function nomeDoAparelho(ua: string) {
  const u = ua || ''
  const navegador = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Navegador'
  const sistema = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android'
    : /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'aparelho desconhecido'
  return `${navegador} no ${sistema}`
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name)

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    private readonly config: ConfigService,
  ) {}

  /**
   * Ligada por padrão. ADMIN_2FA_DISABLED=true no .env é a saída de emergência
   * (ex.: cota do e-mail acabou) e exige acesso ao servidor.
   */
  ativa(): boolean {
    return String(this.config.get('ADMIN_2FA_DISABLED', '')).toLowerCase() !== 'true'
  }

  private emailConfigurado() {
    return Boolean(this.config.get('RESEND_API_KEY') && this.config.get('RESEND_FROM_EMAIL'))
  }

  private emProducao() {
    return this.config.get('NODE_ENV') === 'production'
  }

  async aparelhoConfiavel(adminId: string, deviceToken?: string): Promise<boolean> {
    if (!deviceToken) return false
    const [linha] = await this.sql`
      SELECT id FROM admin_trusted_devices
      WHERE token_hash = ${hashAparelho(deviceToken)} AND admin_id = ${adminId}
        AND revoked_at IS NULL AND expires_at > NOW()
      LIMIT 1
    `
    if (!linha) return false
    await this.sql`UPDATE admin_trusted_devices SET last_used_at = NOW() WHERE id = ${linha.id}`
    return true
  }

  async confiarNoAparelho(adminId: string, ua: string, ip: string): Promise<string> {
    const token = randomBytes(32).toString('hex')
    await this.sql`
      INSERT INTO admin_trusted_devices (admin_id, token_hash, label, ip, last_used_at, expires_at)
      VALUES (${adminId}, ${hashAparelho(token)}, ${nomeDoAparelho(ua)}, ${ip.slice(0, 64)}, NOW(),
              NOW() + make_interval(days => ${APARELHO_DIAS}))
    `
    return token
  }

  /** Gera e envia um código novo; o anterior que ainda estava vivo morre. */
  async criarDesafio(admin: { id: string; email: string; name?: string | null }):
    Promise<{ id: string; previewCode?: string } | { erro: true }> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
    if (this.emailConfigurado()) {
      try {
        await this.enviarEmail(admin.email, 'Seu código de acesso ao Hub Billing', this.htmlCodigo(code, admin.name))
      } catch (err) {
        this.logger.error(`Falha ao enviar código de login: ${(err as Error).message}`)
        return { erro: true }
      }
    } else if (this.emProducao()) {
      this.logger.error('RESEND_API_KEY/RESEND_FROM_EMAIL ausentes: impossível enviar o código de login')
      return { erro: true }
    }
    await this.sql`UPDATE admin_login_codes SET consumed_at = NOW() WHERE admin_id = ${admin.id} AND consumed_at IS NULL`
    const [linha] = await this.sql`
      INSERT INTO admin_login_codes (admin_id, code_hash, expires_at)
      VALUES (${admin.id}, ${await hash(code, 10)}, NOW() + make_interval(mins => ${CODIGO_MINUTOS}))
      RETURNING id
    `
    // Sem e-mail configurado fora de produção, devolve o código para testar.
    return !this.emailConfigurado() && !this.emProducao() ? { id: String(linha.id), previewCode: code } : { id: String(linha.id) }
  }

  /** Confere o código. Erro conta tentativa; na quinta, o código morre. */
  async conferir(challengeId: string, code: string):
    Promise<{ ok: true; adminId: string } | { ok: false; motivo: MotivoFalha }> {
    const [d] = await this.sql`
      SELECT id, admin_id, code_hash, attempts, consumed_at, (expires_at < NOW()) AS vencido
      FROM admin_login_codes WHERE id = ${challengeId} LIMIT 1
    `
    if (!d || d.consumed_at || d.vencido) return { ok: false, motivo: 'expirado' }
    if (Number(d.attempts) >= CODIGO_TENTATIVAS) return { ok: false, motivo: 'esgotado' }
    if (!(await compare(code.trim(), String(d.code_hash)))) {
      const tentativas = Number(d.attempts) + 1
      const esgotou = tentativas >= CODIGO_TENTATIVAS
      await this.sql`
        UPDATE admin_login_codes
        SET attempts = ${tentativas}, consumed_at = ${esgotou ? this.sql`NOW()` : null}
        WHERE id = ${d.id}
      `
      return { ok: false, motivo: esgotou ? 'esgotado' : 'invalido' }
    }
    // Consome só se ainda está vivo: dois envios simultâneos do mesmo código não passam os dois.
    const [consumido] = await this.sql`
      UPDATE admin_login_codes SET consumed_at = NOW() WHERE id = ${d.id} AND consumed_at IS NULL RETURNING id
    `
    if (!consumido) return { ok: false, motivo: 'expirado' }
    return { ok: true, adminId: String(d.admin_id) }
  }

  async desafioParaReenvio(challengeId: string): Promise<{ adminId: string; segundos: number } | null> {
    const [d] = await this.sql`
      SELECT admin_id, EXTRACT(EPOCH FROM (NOW() - created_at)) AS segundos
      FROM admin_login_codes WHERE id = ${challengeId} LIMIT 1
    `
    return d ? { adminId: String(d.admin_id), segundos: Number(d.segundos) } : null
  }

  /** Aviso em segundo plano: se não foi o dono, ele sabe na hora. */
  avisarNovoAparelho(email: string, ua: string, ip: string) {
    if (!this.emailConfigurado()) return
    const quando = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">
      <p>Houve um acesso ao painel do <strong>Hub Billing</strong> num aparelho novo.</p>
      <p><strong>Aparelho:</strong> ${nomeDoAparelho(ua)}<br><strong>IP:</strong> ${escapar(ip)}<br><strong>Quando:</strong> ${quando}</p>
      <p>Se foi você, pode ignorar. Se não foi, troque a senha do painel agora.</p></div>`
    this.enviarEmail(email, 'Novo acesso ao Hub Billing', html)
      .catch((err) => this.logger.warn(`Aviso de aparelho novo falhou: ${(err as Error).message}`))
  }

  private htmlCodigo(code: string, nome?: string | null) {
    return `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111">
      <p>Olá${nome ? `, ${escapar(nome)}` : ''}!</p>
      <p>Seu código para entrar no painel do <strong>Hub Billing</strong> é:</p>
      <p style="font-size:30px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
      <p>Ele vale por ${CODIGO_MINUTOS} minutos. Se não foi você que tentou entrar, troque a senha do painel agora: alguém sabe a sua senha.</p></div>`
  }

  private async enviarEmail(to: string, subject: string, html: string) {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: `Hub Billing <${this.config.get('RESEND_FROM_EMAIL')}>`, to: [to], subject, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!resposta.ok) {
      throw new Error(`Resend ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`)
    }
  }
}

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
