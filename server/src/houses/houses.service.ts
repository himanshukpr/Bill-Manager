import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateHouseDto,
  UpdateHouseDto,
  UpdateHouseLocationDto,
} from './dto/house.dto';

@Injectable()
export class HousesService {
  constructor(private prisma: PrismaService) {}

  async findAll(dairyId: number) {
    return this.prisma.house.findMany({
      where: { dairyId },
      orderBy: { houseNo: 'asc' },
      include: {
        balance: true,
        configs: {
          include: { supplier: { select: { uuid: true, username: true } } },
        },
      },
    });
  }

  async findOne(id: number, dairyId: number) {
    const house = await this.prisma.house.findFirst({
      where: { id, dairyId },
      include: {
        balance: {
          include: {
            payments: { orderBy: { createdAt: 'desc' }, take: 20 },
          },
        },
        configs: {
          include: { supplier: { select: { uuid: true, username: true } } },
        },
        bills: { orderBy: { year: 'desc' }, take: 12 },
      },
    });
    if (!house) throw new NotFoundException(`House #${id} not found in this dairy`);
    return house;
  }

  async create(dto: CreateHouseDto, dairyId: number) {
    const exists = await this.prisma.house.findFirst({
      where: { houseNo: dto.houseNo, dairyId },
    });
    if (exists) throw new ConflictException('House number already exists in this dairy');

    const house = await this.prisma.house.create({
      data: {
        houseNo: dto.houseNo,
        area: dto.area,
        phoneNo: dto.phoneNo,
        alternativePhone: dto.alternativePhone,
        description: dto.description,
        rate1Type: dto.rate1Type,
        rate1: dto.rate1,
        rate2Type: dto.rate2Type,
        rate2: dto.rate2,
        dairyId,
      },
    });

    // Auto-create balance record
    await this.prisma.houseBalance.create({
      data: { houseId: house.id, dairyId },
    });

    return house;
  }

  async update(id: number, dto: UpdateHouseDto, dairyId: number) {
    await this.findOne(id, dairyId);
    return this.prisma.house.update({ where: { id }, data: dto });
  }

  async updateLocation(id: number, dto: UpdateHouseLocationDto, dairyId: number) {
    const location = `${dto.latitude.toFixed(6)},${dto.longitude.toFixed(6)}`;

    const house = await this.prisma.house.findFirst({
      where: { id, dairyId },
    });
    if (!house) throw new NotFoundException(`House #${id} not found`);

    return this.prisma.house.update({
      where: { id },
      data: { location },
    });
  }

  async deactivate(id: number, dairyId: number) {
    await this.findOne(id, dairyId);
    return this.prisma.house.update({ where: { id }, data: { active: false } });
  }

  async reactivate(id: number, dairyId: number) {
    await this.findOne(id, dairyId);
    return this.prisma.house.update({ where: { id }, data: { active: true } });
  }

  async delete(id: number, dairyId: number) {
    await this.findOne(id, dairyId);
    return this.prisma.house.delete({ where: { id } });
  }

  async getStats(dairyId: number) {
    const [totalHouses, balances] = await Promise.all([
      this.prisma.house.count({ where: { dairyId } }),
      this.prisma.houseBalance.aggregate({
        where: { dairyId },
        _sum: { previousBalance: true, currentBalance: true },
      }),
    ]);
    return {
      totalHouses,
      totalPreviousBalance: balances._sum.previousBalance ?? 0,
      totalCurrentBalance: balances._sum.currentBalance ?? 0,
    };
  }
}
