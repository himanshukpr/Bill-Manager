import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateBillDto } from './dto/bill.dto';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) {}

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
    // Check for duplicate bill
    const existing = await this.prisma.bill.findUnique({
      where: {
        houseId_month_year: {
          houseId: dto.houseId,
          month: dto.month,
          year: dto.year,
        },
      },
    });
    if (existing)
      throw new ConflictException(
        `Bill for house #${dto.houseId} for ${dto.month}/${dto.year} already exists`,
      );

    // Get current balance
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${dto.houseId} balance not found`);

    const totalAmount = dto.items.reduce((sum, item) => sum + item.amount, 0);
    const previousBalance = Number(balance.previousBalance);

    // Use transaction: create bill + update balance
    const [bill] = await this.prisma.$transaction([
      this.prisma.bill.create({
        data: {
          houseId: dto.houseId,
          month: dto.month,
          year: dto.year,
          totalAmount,
          items: dto.items as any,
          previousBalance,
          note: dto.note,
        },
        include: { house: { select: { id: true, houseNo: true, area: true } } },
      }),
      // Add bill amount to previousBalance, reset currentBalance
      this.prisma.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          previousBalance: { increment: totalAmount },
          currentBalance: 0,
        },
      }),
    ]);

    return bill;
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
