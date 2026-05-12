import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateAllBillsDto, GenerateBillDto } from './dto/bill.dto';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  private async getLatestHouseNote(houseId: number): Promise<string | null> {
    const lastBill = await this.prisma.bill.findFirst({
      where: { houseId },
      orderBy: { generatedDate: 'desc' },
      select: { note: true },
    });

    return lastBill?.note ?? null;
  }

  private resolvePeriod(dto: { date?: string; fromDate?: string; toDate?: string }) {
    const fromInput = dto.fromDate ?? dto.date;
    const toInput = dto.toDate ?? dto.date;

    if (!fromInput || !toInput) {
      throw new BadRequestException('From and upto dates are required');
    }

    const periodStart = new Date(fromInput);
    const periodEnd = new Date(toInput);

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      throw new BadRequestException('Invalid billing period date');
    }

    periodStart.setHours(0, 0, 0, 0);
    periodEnd.setHours(23, 59, 59, 999);

    if (periodStart > periodEnd) {
      throw new BadRequestException('From date must be before or equal to upto date');
    }

    return {
      periodStart,
      periodEnd,
      month: periodEnd.getMonth() + 1,
      year: periodEnd.getFullYear(),
    };
  }

  private async buildBillDraft(dto: GenerateBillDto) {
    let periodStart: Date
    let periodEnd: Date
    let month: number
    let year: number
    const noteText = dto.note?.trim();

    // If no fromDate/date provided, attempt to use the last bill's generatedDate + 1 day
    if (!dto.fromDate && !dto.date) {
      const lastBill = await this.prisma.bill.findFirst({
        where: { houseId: dto.houseId },
        orderBy: { generatedDate: 'desc' },
        select: { generatedDate: true },
      });

      if (!lastBill) {
        throw new BadRequestException('From date is required for first bill');
      }

      periodStart = new Date(lastBill.generatedDate);
      periodStart.setHours(0, 0, 0, 0);
      periodStart.setDate(periodStart.getDate() + 1);

      const toInput = dto.toDate ?? new Date().toISOString();
      periodEnd = new Date(toInput);
      periodEnd.setHours(23, 59, 59, 999);

      if (periodStart > periodEnd) {
        throw new BadRequestException('From date must be before or equal to upto date');
      }

      month = periodEnd.getMonth() + 1;
      year = periodEnd.getFullYear();
    } else {
      const resolved = this.resolvePeriod(dto);
      periodStart = resolved.periodStart;
      periodEnd = resolved.periodEnd;
      month = resolved.month;
      year = resolved.year;
    }

    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${dto.houseId} balance not found`);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId: dto.houseId,
        deliveredAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    if (deliveryLogs.length === 0) {
      throw new BadRequestException(
        `No delivery logs found for house #${dto.houseId} for ${month}/${year} up to selected date`,
      );
    }

    const totalAmount = deliveryLogs.reduce(
      (sum, log) => sum + Number(log.totalAmount ?? 0),
      0,
    );

    if (totalAmount <= 0) {
      throw new BadRequestException('Cannot generate bill with zero amount');
    }

    const itemSummary = new Map<string, { name: string; qty: number; rate: number; amount: number }>();
    for (const log of deliveryLogs) {
      const logItems = Array.isArray(log.items) ? (log.items as any[]) : [];
      for (const rawItem of logItems) {
        const milkType = String(rawItem?.milkType ?? rawItem?.name ?? 'milk');
        const normalizedType = milkType.toLowerCase();
        const qty = Number(rawItem?.qty ?? 0);
        const rate = Number(rawItem?.rate ?? 0);
        const amount = Number(rawItem?.amount ?? qty * rate);
        if (qty <= 0 || rate <= 0 || amount <= 0) continue;

        const key = `${normalizedType}:${rate}`;
        const existingItem = itemSummary.get(key);
        if (!existingItem) {
          itemSummary.set(key, {
            name: `${normalizedType.charAt(0).toUpperCase()}${normalizedType.slice(1)} Milk`,
            qty,
            rate,
            amount,
          });
        } else {
          existingItem.qty += qty;
          existingItem.amount += amount;
        }
      }
    }

    const billItems = Array.from(itemSummary.values());
    if (billItems.length === 0) {
      billItems.push({
        name: 'Delivery Total',
        qty: 1,
        rate: totalAmount,
        amount: totalAmount,
      });
    }

    return {
      month,
      year,
      periodStart,
      periodEnd,
      totalAmount,
      billItems,
      previousBalance: Number(balance.previousBalance),
      noteText,
    };
  }

  async findAll(filters?: { houseId?: number; month?: number; year?: number }) {
    const where: any = {};
    if (filters?.houseId) where.houseId = filters.houseId;
    if (filters?.month) where.month = filters.month;
    if (filters?.year) where.year = filters.year;

    return this.prisma.bill.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        house: { select: { houseNo: true, area: true, phoneNo: true } },
      },
    });
  }

  async findOne(id: number) {
    const bill = await this.prisma.bill.findUnique({
      where: { id },
      include: {
        house: true,
      },
    });
    if (!bill) throw new NotFoundException(`Bill #${id} not found`);
    return bill;
  }

  async generate(dto: GenerateBillDto) {
    const {
      month,
      year,
      periodStart,
      periodEnd,
      totalAmount,
      billItems,
      previousBalance,
      noteText,
    } = await this.buildBillDraft(dto);

    const bill = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bill.create({
        data: {
          houseId: dto.houseId,
          month,
          year,
          fromDate: periodStart,
          toDate: periodEnd,
          totalAmount,
          items: billItems as any,
          previousBalance,
          generatedDate: periodEnd,
          note: noteText || undefined,
        },
        include: { house: { select: { id: true, houseNo: true, area: true } } },
      });

      await tx.deliveryLog.updateMany({
        where: {
          houseId: dto.houseId,
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        data: { billGenerated: true },
      });

      await tx.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          previousBalance: { increment: totalAmount },
          currentBalance: { decrement: totalAmount },
        },
      });

      return created;
    });

    // After creating a bill, recompute closures in case payments already cover it
    try {
      await this.recomputeClosuresForHouse(dto.houseId);
    } catch {
      // ignore errors from recompute to avoid breaking bill generation
    }

    return bill;
  }

  async getPendingBills(houseId: number) {
    const bills = await this.prisma.bill.findMany({
      where: { houseId },
      orderBy: { generatedDate: 'asc' },
      include: {
        house: { select: { id: true, houseNo: true, area: true } },
      },
    });

    // Get all payments for this house
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance) {
      throw new NotFoundException(`Balance for house #${houseId} not found`);
    }

    const payments = await this.prisma.paymentHistory.findMany({
      where: { balanceRef: balance.id },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate pending amounts for each bill using FIFO
    const paymentQueue = payments.map((p) => ({ amount: Number(p.amount) + Number((p as any).discount ?? 0) }));
    const billsWithPending = bills.map((bill) => {
      const billAmount = Number(bill.totalAmount ?? 0);
      return {
        ...bill,
        pendingAmount: billAmount, // Will be recalculated below
        isClosed: bill.isClosed,
      };
    });

    // Simulate payment allocation using FIFO
    let paymentIndex = 0;
    for (let i = 0; i < billsWithPending.length; i++) {
      const bill = billsWithPending[i];
      let remaining = Number(bill.totalAmount ?? 0);

      while (remaining > 0 && paymentIndex < paymentQueue.length) {
        const head = paymentQueue[paymentIndex];
        if (head.amount <= 0) {
          paymentIndex++;
          continue;
        }
        const take = Math.min(head.amount, remaining);
        head.amount = +(head.amount - take).toFixed(2);
        remaining = +(remaining - take).toFixed(2);
        if (head.amount <= 0) paymentIndex++;
      }

      billsWithPending[i].pendingAmount = Math.max(0, remaining);
    }

    return billsWithPending;
  }

  async generateAll(dto: GenerateAllBillsDto) {
    const houses = await this.prisma.house.findMany({
      select: { id: true, houseNo: true },
      orderBy: { id: 'asc' },
    });

    const generated: Array<{ houseId: number; houseNo: string; billId: number }> = [];
    const skipped: Array<{ houseId: number; houseNo: string; reason: string }> = [];

    for (const house of houses) {
      try {
        const bill = await this.generate({
          houseId: house.id,
          date: dto.date,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          note: dto.note,
        });
        generated.push({ houseId: house.id, houseNo: house.houseNo, billId: bill.id });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error while generating bill';
        skipped.push({ houseId: house.id, houseNo: house.houseNo, reason: message });
      }
    }

    return {
      date: dto.date,
      fromDate: dto.fromDate,
      toDate: dto.toDate,
      totalHouses: houses.length,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      generated,
      skipped,
    };
  }

  async preview(houseId: number, period: { date?: string; fromDate?: string; toDate?: string }) {
    const { periodStart, periodEnd, month, year } = this.resolvePeriod(period);

    const existingBill = await this.prisma.bill.findFirst({
      where: { houseId, month, year },
      select: { id: true },
      orderBy: { generatedDate: 'desc' },
    });

    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${houseId} balance not found`);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId,
        deliveredAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
    });

    const totalAmount = deliveryLogs.reduce(
      (sum, log) => sum + Number(log.totalAmount ?? 0),
      0,
    );

    const previousBalance = Number(balance.previousBalance);

    return {
      totalAmount,
      previousBalance,
      grandTotal: totalAmount + previousBalance,
      logCount: deliveryLogs.length,
      existingBillId: existingBill?.id ?? null,
      lastNote: await this.getLatestHouseNote(houseId),
    };
  }

  async remove(id: number) {
    const bill = await this.findOne(id);

    const periodStart = new Date(bill.year, bill.month - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(bill.generatedDate);
    periodEnd.setHours(23, 59, 59, 999);
    const billTotal = Number(bill.totalAmount ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.bill.delete({ where: { id } });

      await tx.deliveryLog.updateMany({
        where: {
          houseId: bill.houseId,
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        data: { billGenerated: false },
      });

      await tx.houseBalance.update({
        where: { houseId: bill.houseId },
        data: {
          previousBalance: { decrement: billTotal },
          currentBalance: { increment: billTotal },
        },
      });

      return deleted;
    });
  }

  async getMonthlyStats(year: number) {
    const bills = await this.prisma.bill.groupBy({
      by: ['month'],
      where: { year },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { month: 'asc' },
    });
    return bills;
  }

  async getDashboardStats() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [totalBills, billsThisMonth, totalBalance] = await Promise.all([
      this.prisma.bill.count(),
      this.prisma.bill.count({ where: { month, year } }),
      this.prisma.houseBalance.aggregate({
        _sum: { previousBalance: true },
      }),
    ]);

    return {
      totalBills,
      billsThisMonth,
      totalPendingBalance: totalBalance._sum.previousBalance ?? 0,
    };
  }

  // Recompute bill closures for a house by allocating payments to oldest outstanding bills
  async recomputeClosuresForHouse(houseId: number) {
    const balance = await this.prisma.houseBalance.findUnique({ where: { houseId } });
    if (!balance) return;

    const payments = await this.prisma.paymentHistory.findMany({
      where: { balanceRef: balance.id },
      orderBy: { createdAt: 'asc' },
    });

    const bills = await this.prisma.bill.findMany({
      where: { houseId },
      orderBy: { generatedDate: 'asc' },
      select: { id: true, totalAmount: true, generatedDate: true, isClosed: true },
    });

    // Build payment queue (include any discount recorded with the payment)
    const paymentQueue = payments.map((p) => ({ amount: Number(p.amount) + Number((p as any).discount ?? 0) }));

    for (const bill of bills) {
      let remaining = Number(bill.totalAmount ?? 0);
      // If already closed, skip
      if (bill.isClosed) continue;

      // Consume payments in FIFO order
      while (remaining > 0 && paymentQueue.length > 0) {
        const head = paymentQueue[0];
        if (head.amount <= 0) {
          paymentQueue.shift();
          continue;
        }
        const take = Math.min(head.amount, remaining);
        head.amount = +(head.amount - take).toFixed(2);
        remaining = +(remaining - take).toFixed(2);
        if (head.amount <= 0) paymentQueue.shift();
      }

      if (remaining <= 0) {
        // mark bill closed
        await this.prisma.bill.update({ where: { id: bill.id }, data: { isClosed: true } });
      } else {
        // leave as not closed
        await this.prisma.bill.update({ where: { id: bill.id }, data: { isClosed: false } });
      }
    }
  }
}
