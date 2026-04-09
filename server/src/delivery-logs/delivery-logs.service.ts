import {
    BadRequestException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryLogDto } from './dto/delivery-log.dto';

@Injectable()
export class DeliveryLogsService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateDeliveryLogDto, user: any) {
        if (!user?.uuid) {
            throw new BadRequestException('Invalid user context');
        }

        const house = await this.prisma.house.findUnique({ where: { id: dto.houseId } });
        if (!house) throw new NotFoundException(`House #${dto.houseId} not found`);

        const items = (dto.items || []).filter((item) => item.qty > 0 && item.rate > 0);
        if (items.length === 0) {
            throw new BadRequestException('At least one delivery item with positive qty and rate is required');
        }

        const computedTotal = items.reduce((sum, item) => sum + item.amount, 0);

        const balance = await this.prisma.houseBalance.upsert({
            where: { houseId: dto.houseId },
            create: {
                houseId: dto.houseId,
                currentBalance: 0,
                previousBalance: 0,
            },
            update: {},
        });

        const openingBalance = Number(balance.currentBalance ?? 0);
        const closingBalance =
            dto.currentBalance !== undefined ? Number(dto.currentBalance) : openingBalance + computedTotal;

        const [updatedBalance, log] = await this.prisma.$transaction([
            this.prisma.houseBalance.update({
                where: { houseId: dto.houseId },
                data: {
                    currentBalance: closingBalance,
                },
            }),
            this.prisma.deliveryLog.create({
                data: {
                    houseId: dto.houseId,
                    supplierId: user.uuid,
                    shift: dto.shift as Shift,
                    items: items as any,
                    totalAmount: computedTotal,
                    openingBalance,
                    closingBalance,
                    note: dto.note,
                },
                include: {
                    house: { select: { id: true, houseNo: true, area: true } },
                    supplier: { select: { uuid: true, username: true } },
                },
            }),
        ]);

        return {
            log,
            balance: updatedBalance,
        };
    }

    async findAll(filters?: { houseId?: number; shift?: Shift }, user?: any) {
        const where: any = {};

        if (filters?.houseId) where.houseId = filters.houseId;
        if (filters?.shift) where.shift = filters.shift;

        if (user?.role === 'supplier') {
            where.supplierId = user.uuid;
        }

        return this.prisma.deliveryLog.findMany({
            where,
            orderBy: { deliveredAt: 'desc' },
            include: {
                house: { select: { id: true, houseNo: true, area: true } },
                supplier: { select: { uuid: true, username: true } },
            },
        });
    }
}
