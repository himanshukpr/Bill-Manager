import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductRatesController } from './product-rates.controller';
import { ProductRatesService } from './product-rates.service';

@Module({
  imports: [PrismaModule],
  controllers: [ProductRatesController],
  providers: [ProductRatesService],
  exports: [ProductRatesService],
})
export class ProductRatesModule { }
