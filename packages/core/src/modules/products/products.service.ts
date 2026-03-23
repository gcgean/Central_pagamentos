import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { ProductsRepository } from './products.repository'
import { CreateProductDto } from './dto/create-product.dto'

@Injectable()
export class ProductsService {

  constructor(private readonly repo: ProductsRepository) {}

  async create(dto: CreateProductDto) {
    const existing = await this.repo.findByCode(dto.code)
    if (existing) throw new ConflictException(`Código de produto já existe: ${dto.code}`)
    return this.repo.create(dto)
  }

  async findAll() { return this.repo.findAll() }

  async findById(id: string) {
    const p = await this.repo.findById(id)
    if (!p) throw new NotFoundException(`Produto ${id} não encontrado`)
    return p
  }

  async findByCode(code: string) {
    const p = await this.repo.findByCode(code)
    if (!p) throw new NotFoundException(`Produto com código "${code}" não encontrado`)
    return p
  }

  async update(id: string, dto: Partial<CreateProductDto>) {
    await this.findById(id)
    return this.repo.update(id, dto)
  }
}
