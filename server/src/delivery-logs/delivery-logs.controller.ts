import {
    Body,
    Controller,
    Get,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CreateDeliveryLogDto } from './dto/delivery-log.dto';
import { DeliveryLogsService } from './delivery-logs.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-logs')
export class DeliveryLogsController {
    constructor(private service: DeliveryLogsService) { }

    @Get()
    findAll(
        @Query('houseId') houseId?: string,
        @Query('shift') shift?: string,
        @Request() req?: any,
    ) {
        const parsedShift = shift === 'morning' || shift === 'evening' ? (shift as Shift) : undefined;

        return this.service.findAll(
            {
                houseId: houseId ? parseInt(houseId) : undefined,
                shift: parsedShift,
            },
            req?.user,
        );
    }

    @Post()
    create(@Body() dto: CreateDeliveryLogDto, @Request() req: any) {
        return this.service.create(dto, req.user);
    }
}
