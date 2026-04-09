import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { HousesModule } from './houses/houses.module';
import { HouseConfigModule } from './house-config/house-config.module';
import { HouseBalanceModule } from './house-balance/house-balance.module';
import { BillsModule } from './bills/bills.module';
import { ProductRatesModule } from './product-rates/product-rates.module';
import { DeliveryLogsModule } from './delivery-logs/delivery-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    HousesModule,
    HouseConfigModule,
    HouseBalanceModule,
    BillsModule,
    ProductRatesModule,
    DeliveryLogsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
