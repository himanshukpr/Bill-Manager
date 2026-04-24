import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateAllBillsDto, GenerateBillDto } from './dto/bill.dto';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

  private async buildBillDraft(dto: GenerateBillDto) {
    const selectedDate = new Date(dto.date);
    const month = selectedDate.getMonth() + 1;
    const year = selectedDate.getFullYear();

    const existing = await this.prisma.bill.findUnique({
      where: {
        houseId_month_year: {
          houseId: dto.houseId,
          month,
          year,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Bill for house #${dto.houseId} for ${month}/${year} already exists`,
      );
    }

    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${dto.houseId} balance not found`);

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(selectedDate);
    periodEnd.setHours(23, 59, 59, 999);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId: dto.houseId,
        deliveredAt: {
          gte: periodStart,
          lt: periodEnd,
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
      selectedDate,
      totalAmount,
      billItems,
      previousBalance: Number(balance.previousBalance),
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
        house: { select: { id: true, houseNo: true, area: true, phoneNo: true } },
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
    const { month, year, selectedDate, totalAmount, billItems, previousBalance } =
      await this.buildBillDraft(dto);

    // Use transaction: create bill + update balance
    const [bill] = await this.prisma.$transaction([
      this.prisma.bill.create({
        data: {
          houseId: dto.houseId,
          month,
          year,
          totalAmount,
          items: billItems as any,
          previousBalance,
          generatedDate: selectedDate,
          note: dto.note,
        },
        include: { house: { select: { id: true, houseNo: true, area: true } } },
      }),
      // Add bill amount to previousBalance, reset currentBalance
      this.prisma.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          previousBalance: { increment: totalAmount },
          currentBalance: { decrement: totalAmount },
        },
      }),
    ]);

    return bill;
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
      totalHouses: houses.length,
      generatedCount: generated.length,
      skippedCount: skipped.length,
      generated,
      skipped,
    };
  }

  async preview(houseId: number, dateStr: string) {
    const selectedDate = new Date(dateStr);
    const month = selectedDate.getMonth() + 1;
    const year = selectedDate.getFullYear();

    const existingBill = await this.prisma.bill.findUnique({
      where: {
        houseId_month_year: {
          houseId,
          month,
          year,
        },
      },
      select: { id: true },
    });

    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${houseId} balance not found`);

    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(selectedDate);
    periodEnd.setHours(23, 59, 59, 999);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId,
        deliveredAt: {
          gte: periodStart,
          lt: periodEnd,
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
    };
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.bill.delete({ where: { id } });
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
}
