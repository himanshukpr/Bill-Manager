import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateAllBillsDto, GenerateBillDto } from './dto/bill.dto';

@Injectable()
export class BillsService {
  constructor(private prisma: PrismaService) { }

  private async getExistingBillForPeriod(
    houseId: number,
    periodStart: Date,
    periodEnd: Date,
    dairyId: number,
  ) {
    const bills = await this.prisma.bill.findMany({
      where: { houseId, dairyId },
      select: {
        id: true,
        fromDate: true,
        toDate: true,
        month: true,
        year: true,
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return (
      bills.find((bill) => {
        const billStart =
          bill.fromDate ?? new Date(bill.year, bill.month - 1, 1, 0, 0, 0, 0);
        const billEnd =
          bill.toDate ?? new Date(bill.year, bill.month, 0, 23, 59, 59, 999);

        return billStart <= periodEnd && billEnd >= periodStart;
      }) ?? null
    );
  }

  private async getAdjustedPeriodStart(
    houseId: number,
    periodStart: Date,
    periodEnd: Date,
    dairyId: number,
  ): Promise<{ adjustedStart: Date; existingBillToDate: Date | null }> {
    const bills = await this.prisma.bill.findMany({
      where: { houseId, dairyId },
      select: {
        fromDate: true,
        toDate: true,
        month: true,
        year: true,
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    let latestEnd: Date | null = null;

    for (const bill of bills) {
      const billStart =
        bill.fromDate ?? new Date(bill.year, bill.month - 1, 1, 0, 0, 0, 0);
      const billEnd =
        bill.toDate ?? new Date(bill.year, bill.month, 0, 23, 59, 59, 999);

      if (billStart <= periodEnd && billEnd >= periodStart) {
        if (!latestEnd || billEnd > latestEnd) {
          latestEnd = billEnd;
        }
      }
    }

    if (latestEnd && latestEnd < periodEnd) {
      const nextDay = new Date(latestEnd);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      return { adjustedStart: nextDay, existingBillToDate: latestEnd };
    }

    return { adjustedStart: periodStart, existingBillToDate: null };
  }

  async getPeriodClosureState(
    houseId: number,
    periodStart: Date,
    periodEnd: Date,
    dairyId: number,
  ) {
    const [matchingBill, deliveryLogs] = await Promise.all([
      this.getExistingBillForPeriod(houseId, periodStart, periodEnd, dairyId),
      this.prisma.deliveryLog.findMany({
        where: {
          houseId,
          dairyId,
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        select: { billGenerated: true },
      }),
    ]);

    const isClosedByLogs =
      deliveryLogs.length > 0 && deliveryLogs.every((log) => log.billGenerated);
    const isAlreadyClosed = Boolean(matchingBill || isClosedByLogs);

    return {
      isAlreadyClosed,
      alreadyClosedMessage: isAlreadyClosed
        ? 'This period is already closed.'
        : null,
      matchingBillId: matchingBill?.id ?? null,
    };
  }

  private async getLatestHouseNote(houseId: number, dairyId: number): Promise<string | null> {
    const lastBill = await this.prisma.bill.findFirst({
      where: { houseId, dairyId },
      orderBy: { generatedDate: 'desc' },
      select: { note: true },
    });

    return lastBill?.note ?? null;
  }

  private resolvePeriod(dto: {
    date?: string;
    fromDate?: string;
    toDate?: string;
  }) {
    const fromInput = dto.fromDate ?? dto.date;
    const toInput = dto.toDate ?? dto.date;

    if (!fromInput || !toInput) {
      throw new BadRequestException('From and upto dates are required');
    }

    const periodStart = new Date(fromInput);
    const periodEnd = new Date(toInput);

    if (
      Number.isNaN(periodStart.getTime()) ||
      Number.isNaN(periodEnd.getTime())
    ) {
      throw new BadRequestException('Invalid billing period date');
    }

    periodStart.setHours(0, 0, 0, 0);
    periodEnd.setHours(23, 59, 59, 999);

    if (periodStart > periodEnd) {
      throw new BadRequestException(
        'From date must be before or equal to upto date',
      );
    }

    return {
      periodStart,
      periodEnd,
      month: periodEnd.getMonth() + 1,
      year: periodEnd.getFullYear(),
    };
  }

  private async buildBillDraft(dto: GenerateBillDto, dairyId: number) {
    let periodStart: Date;
    let periodEnd: Date;
    let month: number;
    let year: number;
    const noteText = dto.note?.trim();

    // If no fromDate/date provided, attempt to use the last bill's generatedDate + 1 day
    if (!dto.fromDate && !dto.date) {
      const lastBill = await this.prisma.bill.findFirst({
        where: { houseId: dto.houseId, dairyId },
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
        throw new BadRequestException(
          'From date must be before or equal to upto date',
        );
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

    const { adjustedStart } = await this.getAdjustedPeriodStart(
      dto.houseId,
      periodStart,
      periodEnd,
      dairyId,
    );

    const adjustedMonth = periodEnd.getMonth() + 1;
    const adjustedYear = periodEnd.getFullYear();

    const closureState = await this.getPeriodClosureState(
      dto.houseId,
      adjustedStart,
      periodEnd,
      dairyId,
    );
    if (closureState.isAlreadyClosed) {
      throw new ConflictException(
        closureState.alreadyClosedMessage ?? 'This period is already closed.',
      );
    }

    const balance = await this.prisma.houseBalance.findFirst({
      where: { houseId: dto.houseId, dairyId },
    });
    if (!balance)
      throw new NotFoundException(`House #${dto.houseId} balance not found`);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId: dto.houseId,
        dairyId,
        billGenerated: false,
        deliveredAt: {
          gte: adjustedStart,
          lte: periodEnd,
        },
      },
      orderBy: { deliveredAt: 'asc' },
    });
    // Exclude logs that are already marked as billed/closed
    // (note: some code paths relied on billGenerated; ensure we only include un-billed logs)
    // Filter applied above by adding billGenerated: false

    if (deliveryLogs.length === 0) {
      throw new BadRequestException(
        `No delivery logs found for house #${dto.houseId} for ${adjustedMonth}/${adjustedYear} up to selected date`,
      );
    }

    const totalAmount = deliveryLogs.reduce(
      (sum, log) => sum + Number(log.totalAmount ?? 0),
      0,
    );

    if (totalAmount <= 0) {
      throw new BadRequestException('Cannot generate bill with zero amount');
    }

    const itemSummary = new Map<
      string,
      { name: string; qty: number; rate: number; amount: number }
    >();
    for (const log of deliveryLogs) {
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
          const displayName = normalizedType.endsWith('milk')
            ? normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1, -4) + 'Milk'
            : normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1) + ' Milk';
          itemSummary.set(key, {
            name: displayName,
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
      month: adjustedMonth,
      year: adjustedYear,
      periodStart: adjustedStart,
      periodEnd,
      totalAmount,
      billItems,
      previousBalance: Number(balance.previousBalance),
      noteText,
    };
  }

  async findAll(filters?: { houseId?: number; month?: number; year?: number }, dairyId?: number) {
    const where: { houseId?: number; month?: number; year?: number; dairyId?: number } = {};
    if (filters?.houseId) where.houseId = filters.houseId;
    if (filters?.month) where.month = filters.month;
    if (filters?.year) where.year = filters.year;
    if (dairyId) where.dairyId = dairyId;

    return this.prisma.bill.findMany({
      where,
      orderBy: { toDate: 'desc' },
      include: {
        house: { select: { houseNo: true, area: true, phoneNo: true } },
      },
    });
  }

  async findOne(id: number, dairyId: number) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, dairyId },
      include: {
        house: true,
      },
    });
    if (!bill) throw new NotFoundException(`Bill #${id} not found`);
    return bill;
  }

  async generate(dto: GenerateBillDto, dairyId: number) {
    const {
      month,
      year,
      periodStart,
      periodEnd,
      totalAmount,
      billItems,
      previousBalance,
      noteText,
    } = await this.buildBillDraft(dto, dairyId);

    const bill = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bill.create({
        data: {
          houseId: dto.houseId,
          dairyId,
          month,
          year,
          fromDate: periodStart,
          toDate: periodEnd,
          totalAmount,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          items: billItems as any,
          previousBalance,
          generatedDate: periodEnd,
          note: noteText || undefined,
          outstandingAmount: totalAmount + previousBalance,
        },
        include: { house: { select: { id: true, houseNo: true, area: true } } },
      });

      await tx.deliveryLog.updateMany({
        where: {
          houseId: dto.houseId,
          dairyId,
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        data: { billGenerated: true },
      });

      await tx.houseBalance.updateMany({
        where: { houseId: dto.houseId, dairyId },
        data: {
          previousBalance: { increment: totalAmount },
          currentBalance: { decrement: totalAmount },
        },
      });

      return created;
    });

    // After creating a bill, recompute closures in case payments already cover it
    try {
      await this.recomputeClosuresForHouse(dto.houseId, dairyId);
    } catch {
      // ignore errors from recompute to avoid breaking bill generation
    }

    return bill;
  }

  async getPendingBills(houseId: number, dairyId: number) {
    const bills = await this.prisma.bill.findMany({
      where: { houseId, dairyId },
      orderBy: { generatedDate: 'asc' },
      include: {
        house: { select: { id: true, houseNo: true, area: true } },
      },
    });

    // Get all payments for this house
    const balance = await this.prisma.houseBalance.findFirst({
      where: { houseId, dairyId },
    });
    if (!balance) {
      throw new NotFoundException(`Balance for house #${houseId} not found`);
    }

    const payments = await this.prisma.paymentHistory.findMany({
      where: { balanceRef: balance.id },
      orderBy: { createdAt: 'asc' },
    });

    // Calculate pending amounts for each bill using FIFO
    const paymentQueue = payments.map((p) => ({
      amount: Number(p.amount) + Number(p.discount ?? 0),
    }));
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
      // Skip fully paid bills
      if (Number(bill.outstandingAmount ?? 0) === 0) {
        billsWithPending[i].pendingAmount = 0;
        continue;
      }
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

      const unpaidTotal = Math.max(0, remaining);

      // Only the first bill carries previousBalance debt (starting balance).
      // Later bills' previousBalance is a snapshot of rolled-over debt already
      // tracked by earlier bills' outstandingAmounts.
      let prevRemaining = 0;
      if (i === 0) {
        prevRemaining = Number(bill.previousBalance ?? 0);
        while (prevRemaining > 0 && paymentIndex < paymentQueue.length) {
          const head = paymentQueue[paymentIndex];
          if (head.amount <= 0) {
            paymentIndex++;
            continue;
          }
          const take = Math.min(head.amount, prevRemaining);
          head.amount = +(head.amount - take).toFixed(2);
          prevRemaining = +(prevRemaining - take).toFixed(2);
          if (head.amount <= 0) paymentIndex++;
        }
      }

      billsWithPending[i].pendingAmount = unpaidTotal + Math.max(0, prevRemaining);
    }

    return billsWithPending;
  }

  async generateAll(dto: GenerateAllBillsDto, dairyId: number) {
    const houses = await this.prisma.house.findMany({
      where: { dairyId },
      select: { id: true, houseNo: true },
      orderBy: { id: 'asc' },
    });

    const generated: Array<{
      houseId: number;
      houseNo: string;
      billId: number;
    }> = [];
    const skipped: Array<{ houseId: number; houseNo: string; reason: string }> =
      [];

    for (const house of houses) {
      try {
        const bill = await this.generate({
          houseId: house.id,
          date: dto.date,
          fromDate: dto.fromDate,
          toDate: dto.toDate,
          note: dto.note,
        }, dairyId);
        generated.push({
          houseId: house.id,
          houseNo: house.houseNo,
          billId: bill.id,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown error while generating bill';
        skipped.push({
          houseId: house.id,
          houseNo: house.houseNo,
          reason: message,
        });
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

  async preview(
    houseId: number,
    period: { date?: string; fromDate?: string; toDate?: string },
    dairyId: number,
  ) {
    const { periodStart, periodEnd } = this.resolvePeriod(period);

    const { adjustedStart, existingBillToDate } = await this.getAdjustedPeriodStart(
      houseId,
      periodStart,
      periodEnd,
      dairyId,
    );

    const closureState = await this.getPeriodClosureState(
      houseId,
      adjustedStart,
      periodEnd,
      dairyId,
    );

    const balance = await this.prisma.houseBalance.findFirst({
      where: { houseId, dairyId },
    });
    if (!balance)
      throw new NotFoundException(`House #${houseId} balance not found`);

    const deliveryLogs = await this.prisma.deliveryLog.findMany({
      where: {
        houseId,
        dairyId,
        billGenerated: false,
        deliveredAt: {
          gte: adjustedStart,
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
      existingBillId: closureState.matchingBillId,
      lastNote: await this.getLatestHouseNote(houseId, dairyId),
      isAlreadyClosed: closureState.isAlreadyClosed,
      alreadyClosedMessage: closureState.alreadyClosedMessage,
      isDurationAlreadyCreated: false,
      durationAlreadyCreatedMessage: null,
      adjustedFromDate: adjustedStart.toISOString().split('T')[0],
      adjustedToDate: periodEnd.toISOString().split('T')[0],
      skippedToDate: existingBillToDate
        ? existingBillToDate.toISOString().split('T')[0]
        : null,
    };
  }

  async remove(id: number, dairyId: number) {
    const bill = await this.findOne(id, dairyId);

    const periodStart = new Date(bill.year, bill.month - 1, 1, 0, 0, 0, 0);
    const periodEnd = new Date(bill.generatedDate);
    periodEnd.setHours(23, 59, 59, 999);
    const billTotal = Number(bill.totalAmount ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.bill.delete({
        where: { id },
      });

      await tx.deliveryLog.updateMany({
        where: {
          houseId: bill.houseId,
          dairyId,
          deliveredAt: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
        data: { billGenerated: false },
      });

      await tx.houseBalance.updateMany({
        where: { houseId: bill.houseId, dairyId },
        data: {
          previousBalance: { decrement: billTotal },
          currentBalance: { increment: billTotal },
        },
      });

      return deleted;
    });
  }

  async getMonthlyStats(year: number, dairyId: number) {
    const bills = await this.prisma.bill.groupBy({
      by: ['month'],
      where: { year, dairyId },
      _sum: { totalAmount: true },
      _count: { id: true },
      orderBy: { month: 'asc' },
    });
    return bills;
  }

  async getDashboardStats(dairyId: number) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const [totalBills, billsThisMonth, totalBalance] = await Promise.all([
      this.prisma.bill.count({ where: { dairyId } }),
      this.prisma.bill.count({ where: { month, year, dairyId } }),
      this.prisma.houseBalance.aggregate({
        where: { dairyId },
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
  async recomputeClosuresForHouse(houseId: number, dairyId: number) {
    const balance = await this.prisma.houseBalance.findFirst({
      where: { houseId, dairyId },
    });
    if (!balance) return;

    const payments = await this.prisma.paymentHistory.findMany({
      where: { balanceRef: balance.id },
      orderBy: { createdAt: 'asc' },
    });

    const bills = await this.prisma.bill.findMany({
      where: { houseId, dairyId },
      orderBy: { generatedDate: 'asc' },
      select: {
        id: true,
        totalAmount: true,
        previousBalance: true,
        generatedDate: true,
        isClosed: true,
        outstandingAmount: true,
      },
    });

    // Build payment queue (include any discount recorded with the payment)
    const paymentQueue = payments.map((p) => ({
      amount: Number(p.amount) + Number(p.discount ?? 0),
    }));

    for (let i = 0; i < bills.length; i++) {
      const bill = bills[i];
      let remaining = Number(bill.totalAmount ?? 0);

      // Always consume from the queue for EVERY bill (closed or not).
      // Skipping closed bills was the bug: it left their payment in the queue,
      // causing later bills to be incorrectly closed on partial payments.
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

      const unpaidTotal = +Math.max(0, remaining).toFixed(2);

      // Only the first bill carries previousBalance debt (starting balance).
      // Later bills' previousBalance is a snapshot of rolled-over debt already
      // tracked by earlier bills' outstandingAmounts.
      let prevRemaining = 0;
      if (i === 0) {
        prevRemaining = Number(bill.previousBalance ?? 0);
        while (prevRemaining > 0 && paymentQueue.length > 0) {
          const head = paymentQueue[0];
          if (head.amount <= 0) {
            paymentQueue.shift();
            continue;
          }
          const take = Math.min(head.amount, prevRemaining);
          head.amount = +(head.amount - take).toFixed(2);
          prevRemaining = +(prevRemaining - take).toFixed(2);
          if (head.amount <= 0) paymentQueue.shift();
        }
      }

      const shouldBeClosed = unpaidTotal <= 0 && prevRemaining <= 0;
      const outstandingAmount = unpaidTotal + Math.max(0, prevRemaining);

      // Only write to DB if something changed
      if (
        bill.isClosed !== shouldBeClosed ||
        outstandingAmount !== Number(bill.outstandingAmount ?? -1)
      ) {
        await this.prisma.bill.update({
          where: { id: bill.id },
          data: { isClosed: shouldBeClosed, outstandingAmount },
        });
      }
    }
  }
}
