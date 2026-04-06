import { Module } from '@nestjs/common';
import { HouseConfigController } from './house-config.controller';
import { HouseConfigService } from './house-config.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HouseConfigController],
  providers: [HouseConfigService],
  exports: [HouseConfigService],
})
export class HouseConfigModule {}
