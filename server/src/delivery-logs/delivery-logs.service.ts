import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryLogDto, UpdateDeliveryLogDto } from './dto/delivery-log.dto';

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
        const closingBalance = openingBalance + computedTotal;

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
                    billGenerated: dto.billGenerated ?? false,
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

        if (user?.role === 'supplier' && filters?.shift !== Shift.evening) {
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

    async update(id: number, dto: UpdateDeliveryLogDto, user: any) {
        if (!user?.uuid) {
            throw new BadRequestException('Invalid user context');
        }

        const log = await this.prisma.deliveryLog.findUnique({ where: { id } });
        if (!log) throw new NotFoundException(`Delivery log #${id} not found`);

        // Only supplier who created it can update
        if (user.role === 'supplier' && log.supplierId !== user.uuid) {
            throw new ForbiddenException('You can only update your own delivery logs');
        }

        // If items are updated, recalculate total
        if (dto.items && dto.items.length > 0) {
            const validItems = dto.items.filter((item) => item.qty > 0 && item.rate > 0);
            if (validItems.length === 0) {
                throw new BadRequestException('At least one delivery item with positive qty and rate is required');
            }

            const computedTotal = validItems.reduce((sum, item) => sum + item.amount, 0);
            const totalDelta = computedTotal - Number(log.totalAmount ?? 0);

            const [, updatedLog] = await this.prisma.$transaction([
                this.prisma.houseBalance.update({
                    where: { houseId: log.houseId },
                    data: {
                        currentBalance: {
                            increment: totalDelta,
                        },
                    },
                }),
                this.prisma.deliveryLog.update({
                    where: { id },
                    data: {
                        items: validItems as any,
                        totalAmount: computedTotal,
                        closingBalance: Number(log.closingBalance ?? 0) + totalDelta,
                        note: dto.note !== undefined ? dto.note : log.note,
                        ...(dto.billGenerated !== undefined
                            ? { billGenerated: dto.billGenerated }
                            : {}),
                    },
                    include: {
                        house: { select: { id: true, houseNo: true, area: true } },
                        supplier: { select: { uuid: true, username: true } },
                    },
                }),
            ]);

            return updatedLog;
        }

        // Update other fields
        return this.prisma.deliveryLog.update({
            where: { id },
            data: {
                ...(dto.note !== undefined ? { note: dto.note } : {}),
                ...(dto.billGenerated !== undefined
                    ? { billGenerated: dto.billGenerated }
                    : {}),
            },
            include: {
                house: { select: { id: true, houseNo: true, area: true } },
                supplier: { select: { uuid: true, username: true } },
            },
        });
    }

    async remove(id: number, user: any) {
        if (!user?.uuid) {
            throw new BadRequestException('Invalid user context');
        }

        const log = await this.prisma.deliveryLog.findUnique({ where: { id } });
        if (!log) throw new NotFoundException(`Delivery log #${id} not found`);

        // Only supplier who created it or admin can delete
        if (user.role === 'supplier' && log.supplierId !== user.uuid) {
            throw new ForbiddenException('You can only delete your own delivery logs');
        }

        const [deleted] = await this.prisma.$transaction([
            this.prisma.deliveryLog.delete({ where: { id } }),
            this.prisma.houseBalance.update({
                where: { houseId: log.houseId },
                data: {
                    currentBalance: {
                        decrement: Number(log.totalAmount ?? 0),
                    },
                },
            }),
        ]);

        return deleted;
    }
}
