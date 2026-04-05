import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordPaymentDto } from './dto/payment.dto';
import { UpdateHouseBalanceDto } from './dto/balance.dto';

@Injectable()
export class HouseBalanceService {
  constructor(private prisma: PrismaService) { }

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

    const [payment, updatedBalance] = await this.prisma.$transaction([
      this.prisma.paymentHistory.create({
        data: {
          balanceRef: balance.id,
          amount: dto.amount,
          note: dto.note,
        },
      }),
      this.prisma.houseBalance.update({
        where: { houseId: dto.houseId },
        data: {
          previousBalance: {
            decrement: dto.amount,
          },
        },
      }),
    ]);

    return { payment, balance: updatedBalance };
  }

  async updateBalance(houseId: number, dto: UpdateHouseBalanceDto) {
    const house = await this.prisma.house.findUnique({ where: { id: houseId } });
    if (!house) throw new NotFoundException(`House #${houseId} not found`);

    return this.prisma.houseBalance.upsert({
      where: { houseId },
      create: {
        houseId,
        previousBalance: dto.previousBalance ?? 0,
        currentBalance: dto.currentBalance ?? 0,
      },
      update: {
        ...(dto.previousBalance !== undefined ? { previousBalance: dto.previousBalance } : {}),
        ...(dto.currentBalance !== undefined ? { currentBalance: dto.currentBalance } : {}),
      },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });
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
}
