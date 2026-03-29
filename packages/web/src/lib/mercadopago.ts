'use client'

type CardTokenPayload = {
  cardNumber: string
  cardholderName: string
  cardExpirationMonth: string
  cardExpirationYear: string
  securityCode: string
  identificationType: 'CPF' | 'CNPJ'
  identificationNumber: string
}

type CardTokenResult = {
  token: string
  paymentMethodId: string
  issuerId?: string
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale?: string }) => {
      createCardToken: (payload: CardTokenPayload) => Promise<{ id: string }>
    }
  }
}

let sdkPromise: Promise<void> | null = null

export async function loadMercadoPagoSdk() {
  if (typeof window === 'undefined') return
  if (window.MercadoPago) return
  if (!sdkPromise) {
    sdkPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-mp-sdk="true"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('Falha ao carregar SDK Mercado Pago')))
        return
      }
      const script = document.createElement('script')
      script.src = 'https://sdk.mercadopago.com/js/v2'
      script.async = true
      script.dataset.mpSdk = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Falha ao carregar SDK Mercado Pago'))
      document.head.appendChild(script)
    })
  }
  await sdkPromise
}

function normalizeMpError(error: unknown): string {
  if (!error) return 'Falha ao tokenizar cartão.'
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error

  const anyErr = error as any
  const causeDescription =
    anyErr?.cause?.[0]?.description ||
    anyErr?.cause?.[0]?.message ||
    anyErr?.error?.[0]?.description ||
    anyErr?.error?.[0]?.message

  const message =
    causeDescription ||
    anyErr?.message ||
    anyErr?.error_message ||
    anyErr?.error ||
    anyErr?.statusText

  if (message) return String(message)

  try {
    return JSON.stringify(anyErr)
  } catch {
    return 'Falha ao tokenizar cartão.'
  }
}

function sanitizeCardPayload(payload: CardTokenPayload): CardTokenPayload {
  const cardNumber = payload.cardNumber.replace(/\D/g, '')
  const identificationNumber = payload.identificationNumber.replace(/\D/g, '')
  const cardExpirationMonth = payload.cardExpirationMonth.padStart(2, '0')
  const cardExpirationYear =
    payload.cardExpirationYear.length === 2 ? `20${payload.cardExpirationYear}` : payload.cardExpirationYear

  return {
    ...payload,
    cardNumber,
    identificationNumber,
    cardExpirationMonth,
    cardExpirationYear,
  }
}

async function resolvePaymentMethod(publicKey: string, cardNumber: string): Promise<{ paymentMethodId: string; issuerId?: string }> {
  const bin = cardNumber.slice(0, 8)
  const res = await fetch(
    `https://api.mercadopago.com/v1/payment_methods/search?public_key=${encodeURIComponent(publicKey)}&bins=${encodeURIComponent(bin)}`,
  )
  if (!res.ok) {
    return { paymentMethodId: 'master' }
  }
  const data = await res.json() as { results?: Array<{ id?: string; issuer?: { id?: number } }> }
  const first = data.results?.[0]
  if (!first?.id) {
    return { paymentMethodId: 'master' }
  }
  return {
    paymentMethodId: first.id,
    issuerId: first.issuer?.id ? String(first.issuer.id) : undefined,
  }
}

export async function tokenizeCreditCard(publicKey: string, payload: CardTokenPayload): Promise<CardTokenResult> {
  await loadMercadoPagoSdk()
  if (!window.MercadoPago) throw new Error('SDK Mercado Pago não disponível')

  const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' })

  const sanitized = sanitizeCardPayload(payload)

  if (sanitized.cardNumber.length < 13 || sanitized.cardNumber.length > 19) {
    throw new Error('Número do cartão inválido.')
  }
  if (sanitized.identificationType === 'CPF' && sanitized.identificationNumber.length !== 11) {
    throw new Error('CPF inválido para tokenização do cartão.')
  }
  if (sanitized.identificationType === 'CNPJ' && sanitized.identificationNumber.length !== 14) {
    throw new Error('CNPJ inválido para tokenização do cartão.')
  }
  if (sanitized.securityCode.length < 3 || sanitized.securityCode.length > 4) {
    throw new Error('CVV inválido.')
  }

  const method = await resolvePaymentMethod(publicKey, sanitized.cardNumber)

  let tokenResponse: { id: string }
  try {
    tokenResponse = await mp.createCardToken({
      cardNumber: sanitized.cardNumber,
      cardholderName: sanitized.cardholderName,
      cardExpirationMonth: sanitized.cardExpirationMonth,
      cardExpirationYear: sanitized.cardExpirationYear,
      securityCode: sanitized.securityCode,
      identificationType: sanitized.identificationType,
      identificationNumber: sanitized.identificationNumber,
    })
  } catch (error) {
    throw new Error(normalizeMpError(error))
  }

  return {
    token: tokenResponse.id,
    paymentMethodId: method.paymentMethodId,
    issuerId: method.issuerId,
  }
}
