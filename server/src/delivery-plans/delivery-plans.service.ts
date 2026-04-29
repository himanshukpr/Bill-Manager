import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryPlanDto } from './dto/delivery-plan.dto';

@Injectable()
export class DeliveryPlansService {
  constructor(private prisma: PrismaService) { }

  findAll(user?: any) {
    const where = user?.role === 'supplier' && user?.uuid
      ? { supplier_id: user.uuid }
      : undefined;

    return this.prisma.deliveryPlan.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { uuid: true, username: true } },
      },
    });
  }

  create(dto: CreateDeliveryPlanDto, user: any) {
    if (!user?.uuid) {
      throw new BadRequestException('Invalid user context');
    }

    return this.prisma.deliveryPlan.create({
      data: {
        product_name: dto.product_name.trim(),
        quantity_per_go: dto.quantity_per_go,
        number_of_goes: dto.number_of_goes,
        total_quantity: dto.total_quantity,
        users: {
          connect: { uuid: user.uuid },
        },
      },
      include: {
        users: { select: { uuid: true, username: true } },
      },
    });
  }
}