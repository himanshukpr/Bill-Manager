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

  async findAll(dairyId: number) {
    const count = await this.prisma.productRate.count({ where: { dairyId } });
    if (count === 0) {
      await this.prisma.productRate.createMany({
        data: [
          { name: 'Cow Milk', unit: 'L', rate: 0, dairyId },
          { name: 'Buffalo Milk', unit: 'L', rate: 0, dairyId },
        ],
        skipDuplicates: true,
      });
    }

    return this.prisma.productRate.findMany({
      where: { dairyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateProductRateDto, dairyId: number) {
    const exists = await this.prisma.productRate.findFirst({
      where: { name: dto.name, dairyId },
    });

    if (exists) {
      throw new ConflictException('Product already exists in this dairy');
    }

    const maxSort = await this.prisma.productRate.aggregate({
      where: { dairyId },
      _max: { sortOrder: true },
    });

    return this.prisma.productRate.create({
      data: {
        name: dto.name,
        unit: dto.unit?.trim() || 'L',
        rate: dto.rate,
        isActive: dto.isActive ?? true,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        dairyId,
      },
    });
  }

  async update(id: number, dto: UpdateProductRateDto, dairyId: number) {
    const existing = await this.prisma.productRate.findFirst({
      where: { id, dairyId },
    });
    if (!existing) {
      throw new NotFoundException(`Product rate #${id} not found in this dairy`);
    }

    if (dto.name && dto.name !== existing.name) {
      const duplicate = await this.prisma.productRate.findFirst({
        where: { name: dto.name, dairyId },
      });
      if (duplicate) {
        throw new ConflictException('Product name already in use in this dairy');
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

  async reorder(ids: number[], dairyId: number) {
    const uniqueIds = [...new Set(ids)];
    const existingRates = await this.prisma.productRate.findMany({
      where: { dairyId },
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

    return this.findAll(dairyId);
  }

  async remove(id: number, dairyId: number) {
    const existing = await this.prisma.productRate.findFirst({
      where: { id, dairyId },
    });
    if (!existing) {
      throw new NotFoundException(`Product rate #${id} not found in this dairy`);
    }

    return this.prisma.productRate.delete({ where: { id } });
  }
}
