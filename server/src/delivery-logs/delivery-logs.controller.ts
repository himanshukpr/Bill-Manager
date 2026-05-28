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
  Request,
  UseGuards,
} from '@nestjs/common';
import { Shift } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import {
  CreateDeliveryLogDto,
  UpdateDeliveryLogDto,
} from './dto/delivery-log.dto';
import { DeliveryLogsService } from './delivery-logs.service';

interface RequestUser {
  uuid: string;
  username: string;
  email: string;
  role: string;
  isVerified: boolean;
}

@UseGuards(JwtAuthGuard)
@Controller('delivery-logs')
export class DeliveryLogsController {
  constructor(private service: DeliveryLogsService) {}

  @Get()
  findAll(
    @Query('houseId') houseId?: string,
    @Query('shift') shift?: string,
    @Request() req?: { user: RequestUser },
  ) {
    const parsedShift =
      shift === 'morning' || shift === 'evening' ? (shift as Shift) : undefined;

    return this.service.findAll(
      {
        houseId: houseId ? parseInt(houseId) : undefined,
        shift: parsedShift,
      },
      req?.user,
    );
  }

  @Post()
  create(
    @Body() dto: CreateDeliveryLogDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.service.create(dto, req.user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeliveryLogDto,
    @Request() req: { user: RequestUser },
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: RequestUser },
  ) {
    return this.service.remove(id, req.user);
  }
}
