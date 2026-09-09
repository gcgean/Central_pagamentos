import { createHash } from 'node:crypto'

// Utilitário de validação de CPF e CNPJ

export function cleanDocument(doc: string): string {
  return doc.replace(/\D/g, '')
}

export function validateDocument(clean: string, type: 'PF' | 'PJ'): boolean {
  if (type === 'PF') return validateCPF(clean)
  return validateCNPJ(clean)
}

export function validateCPF(cpf: string): boolean {
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false // todos iguais

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i]) * (10 - i)
  let rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  if (rest !== parseInt(cpf[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i]) * (11 - i)
  rest = (sum * 10) % 11
  if (rest === 10 || rest === 11) rest = 0
  return rest === parseInt(cpf[10])
}

export function validateCNPJ(cnpj: string): boolean {
  if (cnpj.length !== 14) return false
  if (/^(\d)\1{13}$/.test(cnpj)) return false

  const calc = (weights: number[]) => {
    let sum = 0
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(cnpj[i]) * weights[i]
    }
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  const d1 = calc([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  if (d1 !== parseInt(cnpj[12])) return false

  const d2 = calc([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return d2 === parseInt(cnpj[13])
}

export function formatCPF(cpf: string): string {
  const c = cleanDocument(cpf)
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
}

export function formatCNPJ(cnpj: string): string {
  const c = cleanDocument(cnpj)
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`
}

/**
 * Documento sintetico para cliente sem CPF/CNPJ — venda fora do Brasil, onde
 * nao existe documento equivalente e o pagamento e por cartao.
 *
 * A coluna `document` e NOT NULL desde o schema inicial, e trocar isso mexeria
 * em todo lugar que le documento. Gerar um valor derivado do e-mail custa
 * menos e mantem o contrato: e deterministico (mesmo e-mail, mesmo valor, o
 * que evita duplicata em retentativa) e comeca com 9, faixa que nao existe em
 * CPF nem CNPJ reais, entao nunca colide com documento de verdade.
 *
 * `attempt` existe para o caso improvavel de colisao de hash entre e-mails
 * diferentes: quem chama tenta o proximo valor.
 */
export function buildSyntheticDocument(email: string, personType: 'PF' | 'PJ', attempt = 0): string {
  const length = personType === 'PJ' ? 14 : 11
  const base = createHash('sha256').update(`${email}:${attempt}`).digest('hex')
  const digits = Array.from(base)
    .map((ch) => (parseInt(ch, 16) % 10).toString())
    .join('')
  return `9${digits.slice(0, length - 1)}`
}
