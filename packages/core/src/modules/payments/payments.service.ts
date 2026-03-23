import { Injectable, Logger } from '@nestjs/common'
import { AsaasGateway } from './gateways/asaas.gateway'
import { PaymentsRepository } from './payments.repository'

@Injectable()
export class PaymentsService {

  private readonly logger = new Logger(PaymentsService.name)

  constructor(
    private readonly asaas: AsaasGateway,
    private readonly repo: PaymentsRepository,
  ) {}

  async refund(externalChargeId: string, value?: number): Promise<void> {
    await this.asaas.refundPayment(externalChargeId, value)
    this.logger.log(`Reembolso solicitado: ${externalChargeId}`)
  }

  async cancelCharge(externalChargeId: string): Promise<void> {
    await this.asaas.cancelCharge(externalChargeId)
    this.logger.log(`Cobrança cancelada: ${externalChargeId}`)
  }

  async getCharge(externalChargeId: string) {
    return this.asaas.getCharge(externalChargeId)
  }
}
