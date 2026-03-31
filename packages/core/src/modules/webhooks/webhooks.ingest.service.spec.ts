import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { WebhooksIngestService } from './webhooks.service'
import { createHmac } from 'crypto'

describe('WebhooksIngestService', () => {
  const repo: any = {
    findByExternalId: jest.fn(),
    create: jest.fn(),
  }
  const queue: any = { add: jest.fn() }
  let service: WebhooksIngestService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new WebhooksIngestService(repo, queue)
  })

  it('deve tratar webhook duplicado como idempotente', async () => {
    repo.findByExternalId.mockResolvedValue({ id: 'evt-1' })

    const result = await service.ingest({
      gatewayName: 'asaas',
      eventType: 'payment.approved',
      externalEventId: 'external-1',
      payload: {},
      rawBody: Buffer.from('{}'),
    })

    expect(result).toEqual({ received: true, eventId: 'evt-1', duplicate: true })
    expect(repo.create).not.toHaveBeenCalled()
    expect(queue.add).not.toHaveBeenCalled()
  })

  it('deve validar assinatura HMAC sha256 (válida e inválida)', () => {
    const rawBody = Buffer.from('{"id":"evt-123"}')
    const secret = 'hub-secret'
    const signature = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`

    expect(service.validateSignature(rawBody, signature, secret)).toBe(true)
    expect(service.validateSignature(rawBody, 'sha256=deadbeef', secret)).toBe(false)
  })
})
