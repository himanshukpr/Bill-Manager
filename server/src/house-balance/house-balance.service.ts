import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordPaymentDto } from './dto/payment.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { BillsService } from '../bills/bills.service';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class HouseBalanceService {
  constructor(
    private prisma: PrismaService,
    private billsService: BillsService,
  ) { }

  async getBalance(houseId: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
    if (!balance)
      throw new NotFoundException(`Balance for house #${houseId} not found`);
    return balance;
  }

  async recordPayment(dto: RecordPaymentDto) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance)
      throw new NotFoundException(
        `Balance for house #${dto.houseId} not found`,
      );

    // Calculate total amount including discount
    const totalAmount = dto.amount + (dto.discount || 0);

    const [payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: balance.id,
          amount: dto.amount,
          note: dto.note,
          discount: dto.discount || 0,
          ...(dto.billIds ? { billIds: dto.billIds } : {}),
        },
      }),
      this.prisma.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          previousBalance: {
            decrement: totalAmount,
          },
        },
      }),
    ]);

    // After recording a payment, try to recompute bill closures for this house
    try {
      await this.billsService.recomputeClosuresForHouse(dto.houseId);
    } catch {
      // ignore errors here
    }

    return { payment, balance: updatedBalance };
  }

  async getPaymentHistory(houseId: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance)
      throw new NotFoundException(`Balance for house #${houseId} not found`);

    return this.prisma.paymentHistory.findMany({
      where: { balanceRef: balance.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllPaymentHistory() {
    return this.prisma.paymentHistory.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        balance: {
          include: {
            house: { select: { id: true, houseNo: true, area: true } },
          },
        },
      },
    });
  }

  async updatePreviousBalance(houseId: number, previousBalance: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
      select: { id: true },
    });

    if (!balance)
      throw new NotFoundException(`Balance for house #${houseId} not found`);

    return this.prisma.houseBalance.update({
      where: { houseId },
      data: { previousBalance },
    });
  }

  async updateCurrentBalance(houseId: number, currentBalance: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
      select: { id: true },
    });

    if (!balance)
      throw new NotFoundException(`Balance for house #${houseId} not found`);

    return this.prisma.houseBalance.update({
      where: { houseId },
      data: { currentBalance },
    });
  }

  // Close a date range by generating a bill + recording payment
  async closePeriod(dto: ClosePeriodDto) {
    const { houseId, fromDate, toDate, note } = dto;

    const periodStart = new Date(fromDate);
    const periodEnd = new Date(toDate);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd.setHours(23, 59, 59, 999);

    const month = periodEnd.getMonth() + 1;
    const year = periodEnd.getFullYear();

    const closureState = await this.billsService.getPeriodClosureState(
      houseId,
      periodStart,
      periodEnd,
    );
    if (closureState.isAlreadyClosed) {
      throw new BadRequestException(
        closureState.alreadyClosedMessage ?? 'This period is already closed.',
      );
    }

    const logs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId,
        deliveredAt: { gte: periodStart, lte: periodEnd },
        isClosed: false,
      },
    });

    if (!logs || logs.length === 0) {
      throw new BadRequestException(
        'No delivery logs found for the selected period to close',
      );
    }

    const billTotal = logs.reduce(
      (s, l) => s + Number(l.totalAmount ?? 0),
      0,
    );
    const amountToApply =
      typeof dto.amount === 'number' ? dto.amount : billTotal;
    const logIds = logs.map((l) => l.id);

    // Aggregate items from delivery logs (same logic as buildBillDraft)
    const itemSummary = new Map<
      string,
      { name: string; qty: number; rate: number; amount: number }
    >();
    for (const log of logs) {
      const logItems = Array.isArray(log.items)
        ? (log.items as {
            milkType?: string;
            name?: string;
            qty?: number;
            rate?: number;
            amount?: number;
          }[])
        : [];
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
            name: milkType,
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
        rate: billTotal,
        amount: billTotal,
      });
    }

    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance)
      throw new NotFoundException(`House #${houseId} balance not found`);

    const unpaid = Math.max(0, billTotal - amountToApply);
    const [bill, payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.bill.create({
        data: {
          houseId,
          month,
          year,
          fromDate: periodStart,
          toDate: periodEnd,
          totalAmount: billTotal,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          items: billItems as any,
          previousBalance: Number(balance.previousBalance),
          generatedDate: periodEnd,
          note: note || undefined,
          outstandingAmount: billTotal + Number(balance.previousBalance),
        },
        include: { house: { select: { id: true, houseNo: true, area: true } } },
      }),
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: balance.id,
          amount: amountToApply,
          note: note ?? `Closed period ${fromDate} - ${toDate}`,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          billIds: logIds as unknown as any,
        },
      }),
      this.prisma.houseBalance.update({
        where: { houseId },
        data: {
          previousBalance: { increment: billTotal - amountToApply },
          currentBalance: { decrement: unpaid },
        },
      }),
      this.prisma.deliveryLog.updateMany({
        where: { id: { in: logIds } },
        data: { billGenerated: true, isClosed: true },
      }),
    ]);

    try {
      await this.billsService.recomputeClosuresForHouse(houseId);
    } catch {
      // ignore
    }

    return { bill, payment, balance: updatedBalance, closedLogIds: logIds };
  }
}
