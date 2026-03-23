import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AsaasGateway } from './gateways/asaas.gateway'
import { PaymentsRepository } from './payments.repository'

@Injectable()
export class PaymentsService {

  private readonly logger = new Logger(PaymentsService.name)
  private readonly mockMode: boolean

  constructor(
    private readonly config: ConfigService,
    private readonly asaas: AsaasGateway,
    private readonly repo: PaymentsRepository,
  ) {
    this.mockMode = config.get<string>('MOCK_GATEWAY') === 'true'
  }

  async refund(externalChargeId: string, value?: number): Promise<void> {
    if (this.mockMode || externalChargeId.startsWith('mock_')) {
      this.logger.warn(`[MOCK] Estorno simulado: ${externalChargeId}`)
      await this.repo.updateChargeStatusByExternalId(externalChargeId, 'refunded')
      return
    }
    await this.asaas.refundPayment(externalChargeId, value)
    this.logger.log(`Reembolso solicitado: ${externalChargeId}`)
  }

  async cancelCharge(externalChargeId: string): Promise<void> {
    if (this.mockMode || externalChargeId.startsWith('mock_')) {
      this.logger.warn(`[MOCK] Cancelamento simulado: ${externalChargeId}`)
      await this.repo.updateChargeStatusByExternalId(externalChargeId, 'canceled')
      return
    }
    await this.asaas.cancelCharge(externalChargeId)
    this.logger.log(`Cobrança cancelada: ${externalChargeId}`)
  }

  async getCharge(externalChargeId: string) {
    if (this.mockMode || externalChargeId.startsWith('mock_')) {
      return { id: externalChargeId, status: 'PENDING', value: 0 }
    }
    return this.asaas.getCharge(externalChargeId)
  }

  async listByOrigin(originType: string, originId: string) {
    return this.repo.listChargesByOrigin(originType, originId)
  }
}
