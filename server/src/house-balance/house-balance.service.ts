import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordPaymentDto } from './dto/payment.dto';
import { BillsService } from '../bills/bills.service';

@Injectable()
export class HouseBalanceService {
  constructor(private prisma: PrismaService, private billsService: BillsService) { }

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
    if (!balance) throw new NotFoundException(`Balance for house #${houseId} not found`);
    return balance;
  }

  async recordPayment(dto: RecordPaymentDto) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId: dto.houseId },
    });
    if (!balance) throw new NotFoundException(`Balance for house #${dto.houseId} not found`);

    // Calculate total amount including discount
    const totalAmount = dto.amount + (dto.discount || 0);

    const [payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: balance.id,
          amount: dto.amount,
          note: dto.note,
          discount: dto.discount || 0,
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
    if (!balance) throw new NotFoundException(`Balance for house #${houseId} not found`);

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
          include: { house: { select: { id: true, houseNo: true, area: true } } },
        },
      },
    });
  }

  async updatePreviousBalance(houseId: number, previousBalance: number) {
    const balance = await this.prisma.houseBalance.findUnique({
      where: { houseId },
      select: { id: true },
    });

    if (!balance) throw new NotFoundException(`Balance for house #${houseId} not found`);

    return this.prisma.houseBalance.update({
      where: { houseId },
      data: { previousBalance },
    });
  }
}
