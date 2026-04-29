import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryPlansController } from './delivery-plans.controller';
import { DeliveryPlansService } from './delivery-plans.service';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryPlansController],
  providers: [DeliveryPlansService],
  exports: [DeliveryPlansService],
})
export class DeliveryPlansModule { }