import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Shift } from '@prisma/client';
import {
  CreateHouseConfigDto,
  UpdateHouseConfigDto,
  ReorderConfigDto,
} from './dto/house-config.dto';

@Injectable()
export class HouseConfigService {
  constructor(private prisma: PrismaService) { }

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
    const existing = await this.prisma.houseConfig.findFirst({
      where: { houseId: dto.houseId },
    });

    if (existing) {
      return this.prisma.houseConfig.update({
        where: { id: existing.id },
        data: {
          shift: dto.shift,
          supplierId: dto.supplierId,
          position: dto.position ?? existing.position,
          dailyAlerts: dto.dailyAlerts,
        },
        include: { house: true },
      });
    }

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

  async reorder(dto: ReorderConfigDto, user?: any) {
    // Validate input
    if (!dto.orderedIds || !Array.isArray(dto.orderedIds) || dto.orderedIds.length === 0) {
      throw new BadRequestException('orderedIds must be a non-empty array');
    }

    // Fetch all configs being reordered
    const configs = await this.prisma.houseConfig.findMany({
      where: { id: { in: dto.orderedIds } },
    });

    if (configs.length !== dto.orderedIds.length) {
      throw new BadRequestException(`Expected ${dto.orderedIds.length} configs, found ${configs.length}`);
    }

    // Supplier permissions:
    // - can reorder all evening configs (shared)
    // - can reorder only their own morning configs
    if (user && user.role === 'supplier') {
      const unauthorizedConfigs = configs.filter((c) => {
        if (c.shift === Shift.evening) return false;
        return !(c.shift === Shift.morning && c.supplierId === user.uuid);
      });

      if (unauthorizedConfigs.length > 0) {
        throw new BadRequestException(
          'Suppliers can reorder evening routes and only their own morning routes',
        );
      }
    }
    // Admins can reorder any configs

    // Update positions in order
    const updates = dto.orderedIds.map((cfgId, index) =>
      this.prisma.houseConfig.update({
        where: { id: cfgId },
        data: { position: index },
        include: { house: true, supplier: { select: { username: true } } },
      }),
    );
    await this.prisma.$transaction(updates);
    return { success: true, updated: configs.length };
  }

  async remove(id: number) {
    const cfg = await this.prisma.houseConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException(`Config #${id} not found`);
    return this.prisma.houseConfig.delete({ where: { id } });
  }
}
