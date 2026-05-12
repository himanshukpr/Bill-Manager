import { Module } from '@nestjs/common';
import { HouseBalanceController } from './house-balance.controller';
import { HouseBalanceService } from './house-balance.service';
import { PrismaModule } from '../prisma/prisma.module';
import { BillsModule } from '../bills/bills.module';

@Module({
  imports: [PrismaModule, BillsModule],
  controllers: [HouseBalanceController],
  providers: [HouseBalanceService],
  exports: [HouseBalanceService],
})
export class HouseBalanceModule {}
