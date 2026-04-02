import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PlansRepository } from './plans.repository'

@Injectable()
export class PlansService {

  constructor(private readonly repo: PlansRepository) {}

  async create(dto: any) { return this.repo.create(dto) }

  async findByProduct(
    productId: string,
    filters?: { status?: string; includeArchived?: boolean },
  ) {
    return this.repo.findByProduct(productId, filters)
  }

  async findById(id: string) {
    const p = await this.repo.findById(id)
    if (!p) throw new NotFoundException(`Plano ${id} não encontrado`)
    return p
  }

  async archive(id: string) {
    return this.deactivate(id)
  }

  async deactivate(id: string) {
    const plan = await this.findById(id)
    const [active] = await this.repo.countActiveSubscriptions(id)
    if (active?.count > 0) {
      throw new ConflictException(
        `Plano possui ${active.count} assinaturas ativas. Arquive apenas após migração.`
      )
    }
    return this.repo.update(id, { status: 'archived' })
  }

  async activate(productId: string, id: string) {
    const plan = await this.findById(id)
    if (plan.productId !== productId) {
      throw new NotFoundException(`Plano ${id} não pertence ao produto ${productId}`)
    }
    return this.repo.update(id, { status: 'active' })
  }

  async update(productId: string, id: string, data: any) {
    const plan = await this.findById(id)
    if (plan.productId !== productId) {
      throw new NotFoundException(`Plano ${id} não pertence ao produto ${productId}`)
    }
    return this.repo.update(id, data)
  }

  async renew(id: string, data: any) {
    return this.repo.update(id, data)
  }
}
