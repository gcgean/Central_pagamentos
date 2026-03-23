'use client'
import { useState } from 'react'
import { Copy, Check, ExternalLink, QrCode } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'

export interface CheckoutResultData {
  chargeId: string
  externalChargeId: string
  checkoutUrl: string | null
  pixQrCode: string | null
  pixPayload: string | null
  boletoUrl: string | null
  amount: number
  currency: string
  dueDate: string
}

export function CheckoutResult({ result, onClose }: { result: CheckoutResultData; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const isPix    = !!result.pixPayload
  const isBoleto = !!result.boletoUrl
  const hasLink  = !!result.checkoutUrl

  return (
    <div className="space-y-5">
      {/* Header com valor e vencimento */}
      <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 mb-0.5">Valor</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(result.amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 mb-0.5">Vencimento</p>
          <p className="text-sm font-medium text-gray-700">{formatDate(result.dueDate)}</p>
        </div>
      </div>

      {/* PIX */}
      {isPix && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <QrCode size={16} className="text-blue-600" />
            <p className="text-sm font-semibold text-gray-800">Pagamento via PIX</p>
          </div>

          {result.pixQrCode && (
            <div className="flex justify-center p-4 bg-white border border-gray-200 rounded-xl">
              <img
                src={`data:image/png;base64,${result.pixQrCode}`}
                alt="QR Code PIX"
                className="w-48 h-48"
              />
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-500 font-medium">Pix Copia e Cola</p>
            <p className="text-xs text-gray-700 break-all font-mono leading-relaxed">
              {result.pixPayload}
            </p>
          </div>

          <Button
            variant={copied ? 'secondary' : 'primary'}
            className="w-full"
            onClick={() => copy(result.pixPayload!)}
          >
            {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar código PIX</>}
          </Button>
        </div>
      )}

      {/* Boleto */}
      {isBoleto && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-800">Boleto Bancário</p>
          <p className="text-sm text-gray-600">
            O boleto foi gerado e vence em <strong>{formatDate(result.dueDate)}</strong>.
          </p>
          <a
            href={result.boletoUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <ExternalLink size={14} /> Abrir / Imprimir Boleto
          </a>
        </div>
      )}

      {/* Link de pagamento genérico (cartão ou UNDEFINED) */}
      {!isPix && !isBoleto && hasLink && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-800">Link de Pagamento</p>
          <a
            href={result.checkoutUrl!}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            <ExternalLink size={14} /> Abrir link de pagamento
          </a>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => copy(result.checkoutUrl!)}
          >
            {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar link</>}
          </Button>
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <Button variant="secondary" className="w-full" onClick={onClose}>Fechar</Button>
      </div>
    </div>
  )
}
