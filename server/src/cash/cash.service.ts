import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashHouseDto, UpdateCashHouseDto } from './dto/cash-house.dto';
import { CreateCashLogDto } from './dto/cash-log.dto';
import {
  CreateCashPaymentDto,
  UpdateCashPaymentDto,
} from './dto/cash-payment.dto';
import { parseDateAsUTC } from '../common/utils/date.util';

export interface CashRequester {
  uuid: string;
  username: string;
  role: string;
  dairyId: number;
}

const SUPPLIER_SELECT = { uuid: true, username: true } as const
const SYSTEM_PAYMENT_LOG_TYPES = ['payment', 'payment_update', 'payment_reversed'] as const;

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  private isAdmin(requester: CashRequester): boolean {
    return requester.role === 'admin';
  }

  private assertAdmin(requester: CashRequester, action = 'perform this action') {
    if (!this.isAdmin(requester)) {
      throw new ForbiddenException(`Only admins can ${action}`);
    }
  }

  private async assertSupplierInDairy(supplierId: string, dairyId: number) {
    const supplier = await this.prisma.user.findFirst({
      where: { uuid: supplierId, dairyId, role: 'supplier' },
      select: { uuid: true, username: true },
    });
    if (!supplier) {
      throw new NotFoundException(
        'Supplier not found in this dairy (must be a supplier user of the same dairy)',
      );
    }
    return supplier;
  }

  private async findHouseOrFail(id: number, dairyId: number) {
    const house = await this.prisma.cashHouse.findFirst({
      where: { id, dairyId },
      include: { supplier: { select: SUPPLIER_SELECT } },
    });
    if (!house) throw new NotFoundException(`Cash house #${id} not found in this dairy`);
    return house;
  }

  private assertHouseAccess(
    house: { supplierId: string | null },
    requester: CashRequester,
  ) {
    if (this.isAdmin(requester)) return;
    if (house.supplierId !== requester.uuid) {
      throw new ForbiddenException('This cash house is not assigned to you');
    }
  }

  // ─── Houses ──────────────────────────────────────────────────────────

  async findAllHouses(requester: CashRequester) {
    const { dairyId } = requester;
    const where = this.isAdmin(requester)
      ? { dairyId }
      : { dairyId, supplierId: requester.uuid };
    return this.prisma.cashHouse.findMany({
      where,
      orderBy: [{ position: 'asc' }, { houseNo: 'asc' }],
      include: {
        supplier: { select: SUPPLIER_SELECT },
        _count: { select: { logs: true, payments: true } },
      },
    });
  }

  async findOneHouse(id: number, requester: CashRequester) {
    const house = await this.prisma.cashHouse.findFirst({
      where: { id, dairyId: requester.dairyId },
      include: {
        supplier: { select: SUPPLIER_SELECT },
        logs: { orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { orderBy: { paidAt: 'desc' }, take: 20 },
      },
    });
    if (!house) throw new NotFoundException(`Cash house #${id} not found in this dairy`);
    this.assertHouseAccess(house, requester);
    return house;
  }

  async createHouse(dto: CreateCashHouseDto, requester: CashRequester) {
    this.assertAdmin(requester, 'create cash houses');
    const { dairyId } = requester;

    const exists = await this.prisma.cashHouse.findFirst({
      where: { houseNo: dto.houseNo, dairyId },
    });
    if (exists) throw new ConflictException('Cash house number already exists in this dairy');

    if (dto.supplierId) {
      await this.assertSupplierInDairy(dto.supplierId, dairyId);
    }

    const house = await this.prisma.cashHouse.create({
      data: {
        houseNo: dto.houseNo,
        area: dto.area,
        phoneNo: dto.phoneNo,
        note: dto.note,
        supplierId: dto.supplierId,
        position: dto.position ?? 0,
        previousBalance: dto.previousBalance ?? 0,
        dairyId,
      },
      include: { supplier: { select: SUPPLIER_SELECT } },
    });

    await this.prisma.cashLog.create({
      data: {
        houseId: house.id,
        dairyId,
        type: 'created',
        title: 'House created',
        description: `Cash house ${house.houseNo} created`,
        balanceAfter: Number(house.previousBalance),
        createdBy: requester.username,
      },
    });

    return house;
  }

  async updateHouse(id: number, dto: UpdateCashHouseDto, requester: CashRequester) {
    const house = await this.findHouseOrFail(id, requester.dairyId);
    this.assertHouseAccess(house, requester);

    if (!this.isAdmin(requester)) {
      // Assigned suppliers may only manage their own route position.
      // Note: class-transformer instantiates every DTO field (as undefined),
      // so only explicitly provided values count.
      const allowedKeys = ['position'];
      const provided = dto as Record<string, unknown>;
      const extraKeys = Object.keys(provided).filter(
        (k) => !(allowedKeys as string[]).includes(k) && provided[k] !== undefined,
      );
      if (extraKeys.length > 0) {
        throw new ForbiddenException(
          'Suppliers can only update the position of their assigned cash houses',
        );
      }
    }

    if (dto.supplierId !== undefined && dto.supplierId !== house.supplierId) {
      if (dto.supplierId) {
        await this.assertSupplierInDairy(dto.supplierId, requester.dairyId);
      }
    }

    if (dto.houseNo && dto.houseNo !== house.houseNo) {
      const duplicate = await this.prisma.cashHouse.findFirst({
        where: { houseNo: dto.houseNo, dairyId: requester.dairyId },
      });
      if (duplicate) throw new ConflictException('Cash house number already exists in this dairy');
    }

    const updated = await this.prisma.cashHouse.update({
      where: { id },
      data: {
        ...(dto.houseNo !== undefined ? { houseNo: dto.houseNo } : {}),
        ...(dto.area !== undefined ? { area: dto.area } : {}),
        ...(dto.phoneNo !== undefined ? { phoneNo: dto.phoneNo } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
        ...(dto.supplierId !== undefined ? { supplierId: dto.supplierId || null } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.previousBalance !== undefined ? { previousBalance: dto.previousBalance } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      include: { supplier: { select: SUPPLIER_SELECT } },
    });

    const events: Array<{ type: string; title: string; description?: string; balanceChange?: number; balanceAfter?: number }> = [];
    if (
      dto.previousBalance !== undefined &&
      Number(dto.previousBalance) !== Number(house.previousBalance)
    ) {
      const balanceChange = Number(dto.previousBalance) - Number(house.previousBalance);
      events.push({
        type: 'balance_update',
        title: 'Previous balance updated',
        description: `${Number(house.previousBalance)} → ${Number(dto.previousBalance)}`,
        balanceChange,
        balanceAfter: Number(dto.previousBalance),
      });
    }
    if (dto.supplierId !== undefined && dto.supplierId !== house.supplierId) {
      events.push({
        type: 'supplier_change',
        title: 'Supplier reassigned',
        description: `Supplier changed for house ${house.houseNo}`,
      });
    }
    if (dto.position !== undefined && dto.position !== house.position) {
      events.push({
        type: 'position',
        title: 'Position updated',
        description: `${house.position} → ${dto.position}`,
      });
    }
    for (const event of events) {
      await this.prisma.cashLog.create({
        data: {
          houseId: id,
          dairyId: requester.dairyId,
          type: event.type,
          title: event.title,
          description: event.description,
          ...(event.balanceChange !== undefined ? { balanceChange: event.balanceChange } : {}),
          ...(event.balanceAfter !== undefined ? { balanceAfter: event.balanceAfter } : {}),
          createdBy: requester.username,
        },
      });
    }

    return updated;
  }

  async reorderHouses(ids: number[], requester: CashRequester) {
    const { dairyId } = requester;
    const houses = await this.prisma.cashHouse.findMany({
      where: { id: { in: ids }, dairyId },
      select: { id: true, supplierId: true },
    });
    if (houses.length !== new Set(ids).size) {
      throw new NotFoundException('One or more cash houses were not found in this dairy');
    }
    if (!this.isAdmin(requester)) {
      const foreign = houses.filter((h) => h.supplierId !== requester.uuid);
      if (foreign.length > 0) {
        throw new ForbiddenException('You can only reorder your own assigned cash houses');
      }
    }
    await this.prisma.$transaction(
      ids.map((houseId, index) =>
        this.prisma.cashHouse.update({
          where: { id: houseId },
          data: { position: index },
        }),
      ),
    );
    return this.findAllHouses(requester);
  }

  async deleteHouse(id: number, requester: CashRequester) {
    this.assertAdmin(requester, 'delete cash houses');
    await this.findHouseOrFail(id, requester.dairyId);
    // Logs and payments cascade-delete via the schema relations.
    return this.prisma.cashHouse.delete({ where: { id } });
  }

  // ─── Logs ────────────────────────────────────────────────────────────

  async findLogs(houseId: number, requester: CashRequester) {
    const house = await this.findHouseOrFail(houseId, requester.dairyId);
    this.assertHouseAccess(house, requester);
    return this.prisma.cashLog.findMany({
      where: { houseId, dairyId: requester.dairyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLog(dto: CreateCashLogDto, requester: CashRequester) {
    const house = await this.findHouseOrFail(dto.houseId, requester.dairyId);
    this.assertHouseAccess(house, requester);

    const balanceChange = dto.balanceChange;
    if (balanceChange === undefined || Number(balanceChange) === 0) {
      return this.prisma.cashLog.create({
        data: {
          houseId: dto.houseId,
          dairyId: requester.dairyId,
          type: dto.type?.trim() || 'note',
          title: dto.title,
          description: dto.description,
          amount: dto.amount ?? undefined,
          balanceAfter: Number(house.previousBalance),
          createdBy: requester.username,
        },
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedHouse = await tx.cashHouse.update({
        where: { id: dto.houseId },
        data: { previousBalance: { increment: balanceChange } },
      });
      return tx.cashLog.create({
        data: {
          houseId: dto.houseId,
          dairyId: requester.dairyId,
          type: dto.type?.trim() || 'balance_update',
          title: dto.title,
          description: dto.description,
          amount: dto.amount ?? Math.abs(balanceChange),
          balanceChange,
          balanceAfter: updatedHouse.previousBalance,
          createdBy: requester.username,
        },
      });
    });
  }

  async deleteLog(id: number, requester: CashRequester) {
    this.assertAdmin(requester, 'delete cash logs');
    const log = await this.prisma.cashLog.findFirst({
      where: { id, dairyId: requester.dairyId },
    });
    if (!log) throw new NotFoundException(`Cash log #${id} not found in this dairy`);

    if (log.balanceChange !== null && Number(log.balanceChange) !== 0) {
      await this.prisma.$transaction([
        this.prisma.cashHouse.update({
          where: { id: log.houseId },
          data: { previousBalance: { increment: -Number(log.balanceChange) } },
        }),
        this.prisma.cashLog.delete({ where: { id } }),
      ]);
      return { deleted: true, balanceRestored: true };
    }

    return this.prisma.cashLog.delete({ where: { id } });
  }

  // ─── Payments ────────────────────────────────────────────────────────

  async findPayments(houseId: number | undefined, requester: CashRequester) {
    const { dairyId } = requester;
    if (houseId !== undefined) {
      const house = await this.findHouseOrFail(houseId, dairyId);
      this.assertHouseAccess(house, requester);
      return this.prisma.cashPayment.findMany({
        where: { houseId, dairyId },
        orderBy: { paidAt: 'desc' },
        include: { house: { select: { id: true, houseNo: true } } },
      });
    }
    const where = this.isAdmin(requester)
      ? { dairyId }
      : { dairyId, house: { supplierId: requester.uuid } };
    return this.prisma.cashPayment.findMany({
      where,
      orderBy: { paidAt: 'desc' },
      take: 200,
      include: { house: { select: { id: true, houseNo: true } } },
    });
  }

  async createPayment(dto: CreateCashPaymentDto, requester: CashRequester) {
    const house = await this.findHouseOrFail(dto.houseId, requester.dairyId);
    this.assertHouseAccess(house, requester);

    const total = Number(dto.amount) + Number(dto.discount ?? 0);

    const [payment] = await this.prisma.$transaction([
      this.prisma.cashPayment.create({
        data: {
          houseId: dto.houseId,
          dairyId: requester.dairyId,
          amount: dto.amount,
          discount: dto.discount ?? 0,
          note: dto.note,
          recordedBy: dto.recordedBy ?? requester.username,
          ...(dto.paidAt ? { paidAt: parseDateAsUTC(dto.paidAt) } : {}),
        },
        include: { house: { select: { id: true, houseNo: true } } },
      }),
      this.prisma.cashHouse.update({
        where: { id: dto.houseId },
        data: { previousBalance: { decrement: total } },
      }),
    ]);

    const after = await this.prisma.cashHouse.findUnique({
      where: { id: dto.houseId },
      select: { previousBalance: true },
    });
    const balanceAfter = Number(after?.previousBalance ?? 0);

    await this.prisma.cashLog.create({
      data: {
        houseId: dto.houseId,
        dairyId: requester.dairyId,
        type: 'payment',
        title: 'Payment received',
        description: dto.note ?? `₹${Number(dto.amount)} received`,
        amount: dto.amount,
        balanceChange: -total,
        balanceAfter,
        createdBy: dto.recordedBy ?? requester.username,
      },
    });

    return payment;
  }

  async updatePayment(id: number, dto: UpdateCashPaymentDto, requester: CashRequester) {
    this.assertAdmin(requester, 'update cash payments');
    const payment = await this.prisma.cashPayment.findFirst({
      where: { id, dairyId: requester.dairyId },
    });
    if (!payment) throw new NotFoundException(`Cash payment #${id} not found in this dairy`);

    if (dto.houseId !== undefined && dto.houseId !== payment.houseId) {
      throw new ForbiddenException('Cash payments cannot be moved between houses');
    }

    const oldTotal = Number(payment.amount) + Number(payment.discount ?? 0);
    const newTotal =
      Number(dto.amount ?? payment.amount) +
      Number(dto.discount ?? payment.discount ?? 0);
    const delta = Number((oldTotal - newTotal).toFixed(2));

    const data: Record<string, unknown> = {};
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.discount !== undefined) data.discount = dto.discount;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.recordedBy !== undefined) data.recordedBy = dto.recordedBy;
    if (dto.paidAt !== undefined) data.paidAt = parseDateAsUTC(dto.paidAt);

    if (delta !== 0) {
      await this.prisma.$transaction([
        this.prisma.cashHouse.update({
          where: { id: payment.houseId },
          data: { previousBalance: { increment: delta } },
        }),
        this.prisma.cashPayment.update({ where: { id }, data }),
      ]);
      const [updatedPayment, afterHouse] = await Promise.all([
        this.prisma.cashPayment.findUnique({ where: { id } }),
        this.prisma.cashHouse.findUnique({ where: { id: payment.houseId }, select: { previousBalance: true } }),
      ]);
      await this.prisma.cashLog.create({
        data: {
          houseId: payment.houseId,
          dairyId: requester.dairyId,
          type: 'payment_update',
          title: 'Payment updated',
          description: `Payment adjusted by ${delta >= 0 ? '+' : '−'}₹${Math.abs(delta)}`,
          amount: newTotal,
          balanceChange: delta,
          balanceAfter: Number(afterHouse?.previousBalance ?? 0),
          createdBy: requester.username,
        },
      });
      return updatedPayment;
    }

    await this.prisma.cashPayment.update({ where: { id }, data });
    return this.prisma.cashPayment.findUnique({ where: { id } });
  }

  async deletePayment(id: number, requester: CashRequester) {
    this.assertAdmin(requester, 'delete cash payments');
    const payment = await this.prisma.cashPayment.findFirst({
      where: { id, dairyId: requester.dairyId },
    });
    if (!payment) throw new NotFoundException(`Cash payment #${id} not found in this dairy`);

    const total = Number(payment.amount) + Number(payment.discount ?? 0);
    await this.prisma.$transaction([
      this.prisma.cashHouse.update({
        where: { id: payment.houseId },
        data: { previousBalance: { increment: total } },
      }),
      this.prisma.cashPayment.delete({ where: { id } }),
    ]);
    const afterHouse = await this.prisma.cashHouse.findUnique({
      where: { id: payment.houseId },
      select: { previousBalance: true },
    });

    await this.prisma.cashLog.create({
      data: {
        houseId: payment.houseId,
        dairyId: requester.dairyId,
        type: 'payment_reversed',
        title: 'Payment deleted',
        description: `₹${Number(payment.amount)} payment reversed`,
        amount: payment.amount,
        balanceChange: total,
        balanceAfter: Number(afterHouse?.previousBalance ?? 0),
        createdBy: requester.username,
      },
    });

    return { deleted: true };
  }

  // ─── Stats & suppliers ───────────────────────────────────────────────

  async getStats(requester: CashRequester) {
    const { dairyId } = requester;
    const houseWhere = this.isAdmin(requester)
      ? { dairyId }
      : { dairyId, supplierId: requester.uuid };
    const [totalHouses, balances, payments] = await Promise.all([
      this.prisma.cashHouse.count({ where: houseWhere }),
      this.prisma.cashHouse.aggregate({
        where: houseWhere,
        _sum: { previousBalance: true },
      }),
      this.prisma.cashPayment.aggregate({
        where: this.isAdmin(requester)
          ? { dairyId }
          : { dairyId, house: { supplierId: requester.uuid } },
        _sum: { amount: true, discount: true },
      }),
    ]);
    return {
      totalHouses,
      totalPreviousBalance: balances._sum.previousBalance ?? 0,
      totalBalance: balances._sum.previousBalance ?? 0,
      totalReceived: payments._sum.amount ?? 0,
      totalDiscount: payments._sum.discount ?? 0,
    };
  }

  async listSuppliers(requester: CashRequester) {
    return this.prisma.user.findMany({
      where: { dairyId: requester.dairyId, role: 'supplier' },
      orderBy: { username: 'asc' },
      select: { uuid: true, username: true, email: true },
    });
  }
}
