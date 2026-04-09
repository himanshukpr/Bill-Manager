import { Module } from '@nestjs/common';
import { DeliveryLogsController } from './delivery-logs.controller';
import { DeliveryLogsService } from './delivery-logs.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    controllers: [DeliveryLogsController],
    providers: [DeliveryLogsService],
})
export class DeliveryLogsModule { }
