import { Module } from '@nestjs/common';
import { HouseBalanceController } from './house-balance.controller';
import { HouseBalanceService } from './house-balance.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HouseBalanceController],
  providers: [HouseBalanceService],
  exports: [HouseBalanceService],
})
export class HouseBalanceModule {}
