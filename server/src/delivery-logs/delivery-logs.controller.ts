import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateDeliveryLogDto,
  UpdateDeliveryLogDto,
} from './dto/delivery-log.dto';
import { DeliveryLogsService } from './delivery-logs.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-logs')
export class DeliveryLogsController {
  constructor(private service: DeliveryLogsService) {}

  @Get()
  findAll(
    @Query('houseId') houseId?: string,
    @Query('shift') shift?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @CurrentUser() user?: any,
  ) {
    const parsedShift =
      shift === 'morning' || shift === 'evening' ? (shift as Shift) : undefined;

    return this.service.findAll(
      {
        houseId: houseId ? parseInt(houseId) : undefined,
        shift: parsedShift,
        fromDate,
        toDate,
      },
      user,
    );
  }

  @Post()
  create(
    @Body() dto: CreateDeliveryLogDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryLogDto,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, user);
  }
}
