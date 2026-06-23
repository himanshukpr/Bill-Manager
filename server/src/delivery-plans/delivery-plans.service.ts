import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryPlanDto } from './dto/delivery-plan.dto';

type UserInfo = {
  uuid: string;
  username?: string;
  email?: string;
  role: string;
  isVerified?: boolean;
  dairyId: number;
};

@Injectable()
export class DeliveryPlansService {
  constructor(private prisma: PrismaService) {}

  findAll(user?: UserInfo) {
    const where: any = {};
    if (user?.dairyId) where.dairyId = user.dairyId;
    if (user?.role === 'supplier' && user?.uuid) {
      where.supplier_id = user.uuid;
    }

    return this.prisma.deliveryPlan.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        users: { select: { uuid: true, username: true } },
      },
    });
  }

  create(dto: CreateDeliveryPlanDto, user: UserInfo) {
    if (!user?.uuid) {
      throw new BadRequestException('Invalid user context');
    }

    return this.prisma.deliveryPlan.create({
      data: {
        product_name: dto.product_name.trim(),
        quantity_per_go: dto.quantity_per_go,
        number_of_goes: dto.number_of_goes,
        total_quantity: dto.total_quantity,
        dairyId: user.dairyId,
        supplier_id: user.uuid,
      },
      include: {
        users: { select: { uuid: true, username: true } },
      },
    });
  }
}
