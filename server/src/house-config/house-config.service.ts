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

type UserInfo = {
  uuid: string;
  username?: string;
  email?: string;
  role: string;
  isVerified?: boolean;
  dairyId: number;
};

@Injectable()
export class HouseConfigService {
  constructor(private prisma: PrismaService) {}

  private normalizeSingleDailyAlert(
    dailyAlerts?: string | null,
  ): string | undefined {
    if (dailyAlerts === undefined || dailyAlerts === null) return undefined;

    const trimmed = dailyAlerts.trim();
    if (!trimmed) return undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return trimmed;
      if (parsed.length === 0) return JSON.stringify([]);
      return JSON.stringify([parsed[0]]);
    } catch {
      return trimmed;
    }
  }

  private async ensureHouseExists(houseId: number, dairyId?: number) {
    const house = await this.prisma.house.findUnique({
      where: { id: houseId },
      select: { id: true, dairyId: true },
    });

    if (!house) {
      throw new NotFoundException(`House #${houseId} not found`);
    }

    if (dairyId && house.dairyId !== dairyId) {
      throw new NotFoundException(`House #${houseId} not found in this dairy`);
    }
  }

  async findAll(supplierId?: string, dairyId?: number) {
    const where: any = {};
    if (supplierId) where.supplierId = supplierId;
    if (dairyId) where.dairyId = dairyId;
    return this.prisma.houseConfig.findMany({
      where,
      orderBy: { position: 'asc' },
      include: {
        house: true,
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async findByHouse(houseId: number, dairyId: number) {
    return this.prisma.houseConfig.findMany({
      where: { houseId, dairyId },
      orderBy: { position: 'asc' },
      include: {
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async create(dto: CreateHouseConfigDto, dairyId: number) {
    await this.ensureHouseExists(dto.houseId, dairyId);

    const existing = await this.prisma.houseConfig.findFirst({
      where: { houseId: dto.houseId, dairyId },
    });

    if (existing) {
      return this.prisma.houseConfig.update({
        where: { id: existing.id },
        data: {
          shift: dto.shift,
          supplierId: dto.supplierId,
          position: dto.position ?? existing.position,
          dailyAlerts: this.normalizeSingleDailyAlert(dto.dailyAlerts),
        },
        include: { house: true },
      });
    }

    const count = await this.prisma.houseConfig.count({
      where: { supplierId: dto.supplierId ?? null, dairyId },
    });
    try {
      return await this.prisma.houseConfig.create({
        data: {
          houseId: dto.houseId,
          shift: dto.shift,
          supplierId: dto.supplierId,
          position: dto.position ?? count,
          dailyAlerts: this.normalizeSingleDailyAlert(dto.dailyAlerts),
          dairyId,
        },
        include: { house: true },
      });
    } catch (error) {
      const prismaError = error as { code?: string; meta?: { cause?: string } };
      if (
        prismaError?.code === 'P2003' &&
        String(prismaError?.meta?.cause ?? '').includes(
          'house_configs_house_id_fkey',
        )
      ) {
        throw new NotFoundException(`House #${dto.houseId} not found`);
      }
      throw error;
    }
  }

  async update(id: number, dto: UpdateHouseConfigDto, dairyId: number) {
    const cfg = await this.prisma.houseConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException(`Config #${id} not found`);
    if (cfg.dairyId !== dairyId) throw new NotFoundException(`Config #${id} not found`);

    if (dto.houseId && dto.houseId !== cfg.houseId) {
      await this.ensureHouseExists(dto.houseId, dairyId);
    }

    const { dailyAlerts, ...rest } = dto;

    return this.prisma.houseConfig.update({
      where: { id },
      data: {
        ...rest,
        ...(dailyAlerts !== undefined
          ? { dailyAlerts: this.normalizeSingleDailyAlert(dailyAlerts) }
          : {}),
      },
      include: { house: true },
    });
  }

  async reorder(dto: ReorderConfigDto, user?: UserInfo) {
    if (
      !dto.orderedIds ||
      !Array.isArray(dto.orderedIds) ||
      dto.orderedIds.length === 0
    ) {
      throw new BadRequestException('orderedIds must be a non-empty array');
    }

    const configs = await this.prisma.houseConfig.findMany({
      where: { id: { in: dto.orderedIds }, dairyId: user?.dairyId },
    });

    if (configs.length !== dto.orderedIds.length) {
      throw new BadRequestException(
        `Expected ${dto.orderedIds.length} configs, found ${configs.length}`,
      );
    }

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

  async remove(id: number, dairyId: number) {
    const cfg = await this.prisma.houseConfig.findUnique({ where: { id } });
    if (!cfg) throw new NotFoundException(`Config #${id} not found`);
    if (cfg.dairyId !== dairyId) throw new NotFoundException(`Config #${id} not found`);
    return this.prisma.houseConfig.delete({ where: { id } });
  }
}
