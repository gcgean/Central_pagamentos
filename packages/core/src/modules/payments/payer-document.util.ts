/**
 * Quem exige o CPF/CNPJ do pagador.
 *
 * O documento não é uma regra do Hub: é exigência de quem processa a cobrança.
 * Pedir onde o gateway não pede só cria atrito — e impede vender para quem não
 * tem CPF, que é o caso de toda a América Latina fora do Brasil. Quando não é
 * exigido, o Hub gera um documento sintético a partir do e-mail
 * (buildSyntheticDocument), porque a coluna é NOT NULL.
 *
 *   - asaas        exige em todos os métodos (a API recusa cliente sem cpfCnpj)
 *   - mercadopago  exige no PIX (payer.identification é obrigatório)
 *   - boleto       exige sempre, em qualquer gateway: o documento do sacado é
 *                  parte do próprio título bancário
 *   - livepix      não coleta documento (checkout hospedado, sem campo)
 *   - stripe       não usa documento brasileiro
 */
export type PayerDocumentMethod = 'PIX' | 'BOLETO' | 'CREDIT_CARD'

/**
 * Quem exige o NOME do pagador digitado no checkout. Segue o documento: os
 * gateways que cobram CPF também querem o nome como está nele (Asaas, Mercado
 * Pago no PIX, boleto em qualquer gateway). LivePix não pede nome e a Stripe
 * coleta o nome do titular na própria página do cartão.
 *
 * Quando não é exigido, o satélite manda o nome do perfil — o cadastro do
 * cliente no Hub continua com nome, só a pessoa não precisa digitar de novo.
 */
export function gatewayRequiresPayerName(
  gatewayName: string | null | undefined,
  method: PayerDocumentMethod,
): boolean {
  return gatewayRequiresPayerDocument(gatewayName, method)
}

export function gatewayRequiresPayerDocument(
  gatewayName: string | null | undefined,
  method: PayerDocumentMethod,
): boolean {
  if (method === 'BOLETO') return true

  const gateway = String(gatewayName ?? '').toLowerCase()
  if (gateway === 'asaas') return true
  if (gateway === 'mercadopago') return method === 'PIX'
  return false
}
