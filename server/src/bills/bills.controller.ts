import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillsService } from './bills.service';
import { GenerateBillDto } from './dto/bill.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(private service: BillsService) {}

  @Get()
  findAll(
    @Query('houseId') houseId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.service.findAll({
      houseId: houseId ? parseInt(houseId) : undefined,
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
    });
  }

  @Get('dashboard-stats')
  getDashboardStats() {
    return this.service.getDashboardStats();
  }

  @Get('monthly-stats/:year')
  getMonthlyStats(@Param('year', ParseIntPipe) year: number) {
    return this.service.getMonthlyStats(year);
  }

  @Get('preview')
  preview(
    @Query('houseId', ParseIntPipe) houseId: number,
    @Query('date') date: string,
  ) {
    return this.service.preview(houseId, date);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post('generate')
  generate(@Body() dto: GenerateBillDto) {
    return this.service.generate(dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
