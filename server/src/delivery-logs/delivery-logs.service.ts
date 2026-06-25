import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDeliveryLogDto,
  UpdateDeliveryLogDto,
} from './dto/delivery-log.dto';

type UserInfo = {
  uuid: string;
  username?: string;
  email?: string;
  role: string;
  isVerified?: boolean;
  dairyId: number;
  permissions?: Record<string, boolean>;
};

@Injectable()
export class DeliveryLogsService {
  constructor(private prisma: PrismaService) { }

  async create(dto: CreateDeliveryLogDto, user: UserInfo) {
    const house = await this.prisma.house.findFirst({
      where: { id: dto.houseId, dairyId: user.dairyId },
    });
    if (!house) throw new NotFoundException(`House #${dto.houseId} not found in this dairy`);

    let supplierId: string | null = null;

    if (user?.role === 'supplier' && user?.uuid) {
      const supplier = await this.prisma.user.findUnique({
        where: { uuid: user.uuid },
      });
      if (supplier) {
        supplierId = user.uuid;
      }
    }

    const items = (dto.items || []).filter(
      (item) => item.qty > 0 && item.rate > 0,
    );
    if (items.length === 0) {
      throw new BadRequestException(
        'At least one delivery item with positive qty and rate is required',
      );
    }

    const computedTotal = items.reduce((sum, item) => sum + item.amount, 0);

    const balance = await this.prisma.houseBalance.upsert({
      where: { houseId: dto.houseId },
      create: {
        houseId: dto.houseId,
        dairyId: user.dairyId,
        currentBalance: 0,
        previousBalance: 0,
      },
      update: {},
    });

    const openingBalance = Number(balance.currentBalance ?? 0);
    const closingBalance = openingBalance + computedTotal;

    const data: any = {
      houseId: dto.houseId,
      dairyId: user.dairyId,
      shift: dto.shift as Shift,
      billGenerated: dto.billGenerated ?? false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      items: items as any,
      totalAmount: computedTotal,
      openingBalance,
      closingBalance,
      ...(typeof supplierId === 'string' ? { supplierId } : {}),
      ...(dto.note ? { note: dto.note } : {}),
      ...(dto.deliveredAt ? { deliveredAt: new Date(dto.deliveredAt) } : {}),
    };

    const [updatedBalance, log] = await this.prisma.$transaction([
      this.prisma.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          currentBalance: { increment: computedTotal },
        },
      }),

      this.prisma.deliveryLog.create({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data,
        include: {
          house: { select: { id: true, houseNo: true, area: true } },
          supplier: { select: { uuid: true, username: true } },
        },
      }),
    ]);

    return {
      log,
      balance: updatedBalance,
    };
  }

  async findAll(
    filters?: { houseId?: number; shift?: Shift; fromDate?: string; toDate?: string },
    user?: UserInfo,
  ) {
    const where: {
      houseId?: number;
      shift?: Shift;
      supplierId?: string;
      dairyId?: number;
      deliveredAt?: { gte?: Date; lte?: Date };
    } = {};

    if (user?.dairyId) where.dairyId = user.dairyId;
    if (filters?.houseId) where.houseId = filters.houseId;
    if (filters?.shift) where.shift = filters.shift;
    if (filters?.fromDate || filters?.toDate) {
      where.deliveredAt = {
        ...(filters.fromDate ? { gte: new Date(filters.fromDate) } : {}),
        ...(filters.toDate ? { lte: new Date(filters.toDate) } : {}),
      };
    }

    // Suppliers should only be restricted to their own logs when
    // explicitly querying for morning/evening deliveries. For
    // unfiltered queries (used by the supplier direct-entry UI to
    // show recent shop entries) we allow returning admin-created shop
    // records as well.
    if (user?.role === 'supplier') {
      if (
        filters?.shift === Shift.morning ||
        filters?.shift === Shift.evening
      ) {
        where.supplierId = user.uuid;
      }
    }

    return this.prisma.deliveryLog.findMany({
      where,
      orderBy: { deliveredAt: 'desc' },
      include: {
        house: { select: { id: true, houseNo: true, area: true } },
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async update(id: number, dto: UpdateDeliveryLogDto, user: UserInfo) {
    if (!user?.uuid) {
      throw new BadRequestException('Invalid user context');
    }

    // Check modify permission for suppliers
    if (user.role === 'supplier' && !user.permissions?.canModifyDeliveryLogs) {
      throw new ForbiddenException(
        'You do not have permission to modify delivery logs',
      );
    }

    const log = await this.prisma.deliveryLog.findFirst({
      where: { id, dairyId: user.dairyId },
    });
    if (!log) throw new NotFoundException(`Delivery log #${id} not found in this dairy`);

    // Only supplier who created it can update
    if (user.role === 'supplier' && log.supplierId !== user.uuid) {
      throw new ForbiddenException(
        'You can only update your own delivery logs',
      );
    }

    // If items are updated, recalculate total
    if (dto.items && dto.items.length > 0) {
      const validItems = dto.items.filter(
        (item) => item.qty > 0 && item.rate > 0,
      );
      if (validItems.length === 0) {
        throw new BadRequestException(
          'At least one delivery item with positive qty and rate is required',
        );
      }

      const computedTotal = validItems.reduce(
        (sum, item) => sum + item.amount,
        0,
      );
      const totalDelta = computedTotal - Number(log.totalAmount ?? 0);

      const [, updatedLog] = await this.prisma.$transaction([
        this.prisma.houseBalance.update({
          where: { houseId: log.houseId },
          data: {
            currentBalance: {
              increment: totalDelta,
            },
          },
        }),
        this.prisma.deliveryLog.update({
          where: { id },
          data: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            items: validItems as any,
            totalAmount: computedTotal,
            closingBalance: Number(log.closingBalance ?? 0) + totalDelta,
            note: dto.note !== undefined ? dto.note : log.note,
            ...(dto.billGenerated !== undefined
              ? { billGenerated: dto.billGenerated }
              : {}),
          },
          include: {
            house: { select: { id: true, houseNo: true, area: true } },
            supplier: { select: { uuid: true, username: true } },
          },
        }),
      ]);

      return updatedLog;
    }

    // Update other fields
    return this.prisma.deliveryLog.update({
      where: { id },
      data: {
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.billGenerated !== undefined
          ? { billGenerated: dto.billGenerated }
          : {}),
      },
      include: {
        house: { select: { id: true, houseNo: true, area: true } },
        supplier: { select: { uuid: true, username: true } },
      },
    });
  }

  async remove(id: number, user: UserInfo) {
    if (!user?.uuid) {
      throw new BadRequestException('Invalid user context');
    }

    // Check modify permission for suppliers
    if (user.role === 'supplier' && !user.permissions?.canModifyDeliveryLogs) {
      throw new ForbiddenException(
        'You do not have permission to modify delivery logs',
      );
    }

    const log = await this.prisma.deliveryLog.findFirst({
      where: { id, dairyId: user.dairyId },
    });
    if (!log) throw new NotFoundException(`Delivery log #${id} not found in this dairy`);

    // Only supplier who created it or admin can delete
    if (user.role === 'supplier' && log.supplierId !== user.uuid) {
      throw new ForbiddenException(
        'You can only delete your own delivery logs',
      );
    }

    const [deleted] = await this.prisma.$transaction([
      this.prisma.deliveryLog.delete({ where: { id } }),
      this.prisma.houseBalance.update({
        where: { houseId: log.houseId },
        data: {
          currentBalance: {
            decrement: Number(log.totalAmount ?? 0),
          },
        },
      }),
    ]);

    return deleted;
  }
}
