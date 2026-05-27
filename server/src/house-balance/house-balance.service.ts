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
  ) {}

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

  // Close a date range by marking delivery logs in the range as billed/closed
  async closePeriod(dto: ClosePeriodDto) {
    const { houseId, fromDate, toDate, note } = dto;

    const periodStart = new Date(fromDate);
    const periodEnd = new Date(toDate);
    periodStart.setHours(0, 0, 0, 0);
    periodEnd.setHours(23, 59, 59, 999);

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
        houseId: dto.houseId,
        deliveredAt: { gte: periodStart, lte: periodEnd },
        billGenerated: false,
      },
    });

    if (!logs || logs.length === 0) {
      throw new BadRequestException(
        'No delivery logs found for the selected period to close',
      );
    }

    const computedAmount = logs.reduce(
      (s, l) => s + Number(l.totalAmount ?? 0),
      0,
    );
    const amountToApply =
      typeof dto.amount === 'number' ? dto.amount : computedAmount;

    const logIds = logs.map((l) => l.id);

    const [payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: (await this.prisma.houseBalance.findUnique({
            where: { houseId },
          }))!.id,
          amount: amountToApply,
          note: note ?? `Closed period ${fromDate} - ${toDate}`,
          billIds: logIds as unknown as any,
        },
      }),
      this.prisma.houseBalance.update({
        where: { houseId },
        data: {
          previousBalance: { decrement: amountToApply },
        },
      }),
      this.prisma.deliveryLog.updateMany({
        where: { id: { in: logIds } },
        data: { billGenerated: true },
      }),
    ]);

    try {
      await this.billsService.recomputeClosuresForHouse(houseId);
    } catch {
      // ignore
    }

    return { payment, balance: updatedBalance, closedLogIds: logIds };
  }
}
