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
      return {
        id: 0,
        houseId,
        previousBalance: 0,
        currentBalance: 0,
        updatedAt: new Date(),
        payments: [],
      };
    return balance;
  }

  async recordPayment(dto: RecordPaymentDto) {
    let balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance) {
      balance = await this.prisma.houseBalance.create({
        data: { houseId: dto.houseId },
      });
    }

    // Calculate total amount including discount
    const totalAmount = dto.amount + (dto.discount || 0);

    const [payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: balance.id,
          amount: dto.amount,
          note: dto.note,
          discount: dto.discount || 0,
          ...(dto.paidAt ? { paidAt: new Date(dto.paidAt) } : {}),
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

    // Deduct the payment from the latest bill's outstandingAmount
    try {
      const latestBill = await this.prisma.bill.findFirst({
        where: { houseId: dto.houseId },
        orderBy: { generatedDate: 'desc' },
        select: { id: true, totalAmount: true, outstandingAmount: true },
      });
      if (latestBill) {
        const billOutstanding = Number(latestBill.outstandingAmount ?? latestBill.totalAmount ?? 0);
        const paid = Math.min(totalAmount, billOutstanding);
        const newOutstanding = Math.max(0, billOutstanding - paid).toFixed(2);
        await this.prisma.bill.update({
          where: { id: latestBill.id },
          data: {
            outstandingAmount: +newOutstanding,
            isClosed: +newOutstanding <= 0,
          },
        });
      }
    } catch {
      // ignore errors here
    }

    return { payment, balance: updatedBalance };
  }

  async getPaymentHistory(houseId: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
    });
    if (!balance) return [];

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
    return this.prisma.houseBalance.upsert({
      where: { houseId },
      create: { houseId, previousBalance },
      update: { previousBalance },
    });
  }

  async updateCurrentBalance(houseId: number, currentBalance: number) {
    return this.prisma.houseBalance.upsert({
      where: { houseId },
      create: { houseId, currentBalance },
      update: { currentBalance },
    });
  }

  async updatePayment(id: number, dto: { note?: string; amount?: number; discount?: number; paidAt?: string }) {
    const payment = await this.prisma.paymentHistory.findUnique({
      where: { id },
      include: { balance: true },
    });
    if (!payment)
      throw new NotFoundException(`Payment #${id} not found`);

    const data: Record<string, unknown> = {};
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.discount !== undefined) data.discount = dto.discount;
    if (dto.paidAt !== undefined) data.paidAt = new Date(dto.paidAt);

    const oldTotal = Number(payment.amount) + Number(payment.discount ?? 0);
    const newTotal =
      (dto.amount ?? Number(payment.amount)) +
      (dto.discount ?? Number(payment.discount ?? 0));
    const delta = +(oldTotal - newTotal).toFixed(2); // positive = refund, negative = more to deduct

    if (delta !== 0) {
      // Find the bill that was current when this payment was recorded
      const billAtPaymentTime = await this.prisma.bill.findFirst({
        where: { houseId: payment.balance.houseId, generatedDate: { lte: payment.createdAt } },
        orderBy: { generatedDate: 'desc' },
        select: { id: true, outstandingAmount: true, totalAmount: true },
      });

      if (billAtPaymentTime) {
        await this.prisma.$transaction([
          this.prisma.houseBalance.update({
            where: { id: payment.balanceRef },
            data: {
              previousBalance: { increment: delta },
            },
          }),
          this.prisma.bill.update({
            where: { id: billAtPaymentTime.id },
            data: {
              outstandingAmount: {
                increment: delta,
              },
              isClosed: false,
            },
          }),
          this.prisma.paymentHistory.update({
            where: { id },
            data,
          }),
        ]);
      } else {
        await this.prisma.$transaction([
          this.prisma.houseBalance.update({
            where: { id: payment.balanceRef },
            data: {
              previousBalance: { increment: delta },
            },
          }),
          this.prisma.paymentHistory.update({
            where: { id },
            data,
          }),
        ]);
      }
    } else {
      await this.prisma.paymentHistory.update({
        where: { id },
        data,
      });
    }

    return { updated: true };
  }

  async deletePayment(id: number) {
    const payment = await this.prisma.paymentHistory.findUnique({
      where: { id },
      include: { balance: true },
    });
    if (!payment)
      throw new NotFoundException(`Payment #${id} not found`);

    const totalAmount = Number(payment.amount) + Number(payment.discount ?? 0);

    // Find the bill that was adjusted when this payment was recorded
    const billAtPaymentTime = await this.prisma.bill.findFirst({
      where: { houseId: payment.balance.houseId, generatedDate: { lte: payment.createdAt } },
      orderBy: { generatedDate: 'desc' },
      select: { id: true, outstandingAmount: true, totalAmount: true },
    });

    // Reverse bill outstanding adjustment on the bill that was current at payment time
    if (billAtPaymentTime) {
      const billOutstanding = Number(billAtPaymentTime.outstandingAmount ?? billAtPaymentTime.totalAmount ?? 0);
      const newOutstanding = +(billOutstanding + totalAmount).toFixed(2);
      await this.prisma.$transaction([
        this.prisma.houseBalance.update({
          where: { id: payment.balanceRef },
          data: {
            previousBalance: { increment: totalAmount },
          },
        }),
        this.prisma.bill.update({
          where: { id: billAtPaymentTime.id },
          data: {
            outstandingAmount: newOutstanding,
            isClosed: newOutstanding <= 0,
          },
        }),
        this.prisma.paymentHistory.delete({
          where: { id },
        }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.houseBalance.update({
          where: { id: payment.balanceRef },
          data: {
            previousBalance: { increment: totalAmount },
          },
        }),
        this.prisma.paymentHistory.delete({
          where: { id },
        }),
      ]);
    }

    return { deleted: true };
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
          currentBalance: { decrement: billTotal },
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
