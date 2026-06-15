import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductRateDto,
  UpdateProductRateDto,
} from './dto/product-rate.dto';

@Injectable()
export class ProductRatesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const count = await this.prisma.productRate.count();
    if (count === 0) {
      await this.prisma.productRate.createMany({
        data: [
          { name: 'Cow Milk', unit: 'L', rate: 0 },
          { name: 'Buffalo Milk', unit: 'L', rate: 0 },
        ],
        skipDuplicates: true,
      });
    }

    return this.prisma.productRate.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateProductRateDto) {
    const exists = await this.prisma.productRate.findUnique({
      where: { name: dto.name },
    });

    if (exists) {
      throw new ConflictException('Product already exists');
    }

    const maxSort = await this.prisma.productRate.aggregate({
      _max: { sortOrder: true },
    });

    return this.prisma.productRate.create({
      data: {
        name: dto.name,
        unit: dto.unit?.trim() || 'L',
        rate: dto.rate,
        isActive: dto.isActive ?? true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: number, dto: UpdateProductRateDto) {
    const existing = await this.prisma.productRate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Product rate #${id} not found`);
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.productRate.findUnique({
        where: { name: dto.name },
      });
      if (duplicate) {
        throw new ConflictException('Product name already in use');
      }
    }

    return this.prisma.productRate.update({
      where: { id },
      data: {
        ...dto,
        unit: dto.unit?.trim() || dto.unit,
      },
    });
  }

  async reorder(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    const existingRates = await this.prisma.productRate.findMany({
      select: { id: true },
    });
    const existingIds = new Set(existingRates.map((rate) => rate.id));

    if (
      uniqueIds.length !== existingIds.size ||
      uniqueIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException('Invalid product rate order');
    }

    await this.prisma.$transaction(
      uniqueIds.map((id, index) =>
        this.prisma.productRate.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.findAll();
  }

  async remove(id: number) {
    const existing = await this.prisma.productRate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Product rate #${id} not found`);
    }

    return this.prisma.productRate.delete({ where: { id } });
  }
}
