import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { PlansRepository } from './plans.repository'

@Injectable()
export class PlansService {

  constructor(private readonly repo: PlansRepository) {}

  async create(dto: any) { return this.repo.create(dto) }

  async findByProduct(productId: string) { return this.repo.findByProduct(productId) }

  async findById(id: string) {
    const p = await this.repo.findById(id)
    if (!p) throw new NotFoundException(`Plano ${id} não encontrado`)
    return p
  }

  async archive(id: string) {
    const plan = await this.findById(id)
    const [active] = await this.repo.countActiveSubscriptions(id)
    if (active?.count > 0) {
      throw new ConflictException(
        `Plano possui ${active.count} assinaturas ativas. Arquive apenas após migração.`
      )
    }
    return this.repo.update(id, { status: 'archived' })
  }

  async renew(id: string, data: any) {
    return this.repo.update(id, data)
  }
}
