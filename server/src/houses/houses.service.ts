import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHouseDto, UpdateHouseDto, UpdateHouseLocationDto } from './dto/house.dto';

@Injectable()
export class HousesService {
  constructor(private prisma: PrismaService) { }

  async findAll() {
    return this.prisma.house.findMany({
      orderBy: { houseNo: 'asc' },
      include: {
        balance: true,
        configs: {
          include: { supplier: { select: { uuid: true, username: true } } },
        },
      },
    });
  }

  async findOne(id: number) {
    const house = await this.prisma.house.findUnique({
      where: { id },
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
    if (!house) throw new NotFoundException(`House #${id} not found`);
    return house;
  }

  async create(dto: CreateHouseDto) {
    const exists = await this.prisma.house.findUnique({
      where: { houseNo: dto.houseNo },
    });
    if (exists) throw new ConflictException('House number already exists');

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
      },
    });

    // Auto-create balance record
    await this.prisma.houseBalance.create({
      data: { houseId: house.id },
    });

    return house;
  }

  async update(id: number, dto: UpdateHouseDto) {
    await this.findOne(id);
    return this.prisma.house.update({ where: { id }, data: dto });
  }

  async updateLocation(id: number, dto: UpdateHouseLocationDto) {
    const location = `${dto.latitude.toFixed(6)},${dto.longitude.toFixed(6)}`;

    try {
      return await this.prisma.house.update({
        where: { id },
        data: { location },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`House #${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.house.delete({ where: { id } });
  }

  async getStats() {
    const [totalHouses, balances] = await Promise.all([
      this.prisma.house.count(),
      this.prisma.houseBalance.aggregate({
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
