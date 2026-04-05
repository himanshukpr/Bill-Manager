import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHouseConfigDto,
  UpdateHouseConfigDto,
  ReorderConfigDto,
} from './dto/house-config.dto';

@Injectable()
export class HouseConfigService {
  constructor(private prisma: PrismaService) {}

  async findAll(supplierId?: string) {
    const where = supplierId ? { supplierId } : {};
    return this.prisma.houseConfig.findMany({
      where,
      orderBy: { position: 'asc' },
      include: {
        house: true,
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async findByHouse(houseId: number) {
    return this.prisma.houseConfig.findMany({
      where: { houseId },
      orderBy: { position: 'asc' },
      include: {
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async create(dto: CreateHouseConfigDto) {
    const count = await this.prisma.houseConfig.count({
      where: { supplierId: dto.supplierId ?? null },
    });
    return this.prisma.houseConfig.create({
      data: {
        houseId: dto.houseId,
        shift: dto.shift,
        supplierId: dto.supplierId,
        position: dto.position ?? count,
        dailyAlerts: dto.dailyAlerts,
      },
      include: { house: true },
    });
  }

  async update(id: number, dto: UpdateHouseConfigDto) {
    const cfg = await this.prisma.houseConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException(`Config #${id} not found`);
    return this.prisma.houseConfig.update({
      where: { id },
      data: dto,
      include: { house: true },
    });
  }

  async reorder(dto: ReorderConfigDto) {
    const updates = dto.orderedIds.map((cfgId, index) =>
      this.prisma.houseConfig.update({
        where: { id: cfgId },
        data: { position: index },
      }),
    );
    await this.prisma.$transaction(updates);
    return { success: true };
  }

  async remove(id: number) {
    const cfg = await this.prisma.houseConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException(`Config #${id} not found`);
    return this.prisma.houseConfig.delete({ where: { id } });
  }
}
