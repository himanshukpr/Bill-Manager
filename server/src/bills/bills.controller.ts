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
import { GenerateAllBillsDto, GenerateBillDto } from './dto/bill.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bills')
export class BillsController {
  constructor(private service: BillsService) {}

  @Get()
  findAll(
    @Query('houseId') houseId: string | undefined,
    @Query('month') month: string | undefined,
    @Query('year') year: string | undefined,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.findAll({
      houseId: houseId ? parseInt(houseId) : undefined,
      month: month ? parseInt(month) : undefined,
      year: year ? parseInt(year) : undefined,
    }, dairyId);
  }

  @Get('dashboard-stats')
  getDashboardStats(@CurrentUser('dairyId') dairyId: number) {
    return this.service.getDashboardStats(dairyId);
  }

  @Get('monthly-stats/:year')
  getMonthlyStats(
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.getMonthlyStats(year, dairyId);
  }

  @Get('pending/:houseId')
  getPendingBills(
    @Param('houseId', ParseIntPipe) houseId: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.getPendingBills(houseId, dairyId);
  }

  @Get('preview')
  preview(
    @Query('houseId', ParseIntPipe) houseId: number,
    @Query('date') date: string | undefined,
    @Query('fromDate') fromDate: string | undefined,
    @Query('toDate') toDate: string | undefined,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.preview(houseId, { date, fromDate, toDate }, dairyId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.findOne(id, dairyId);
  }

  @Post('generate')
  generate(
    @Body() dto: GenerateBillDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.generate(dto, dairyId);
  }

  @Post('generate-all')
  generateAll(
    @Body() dto: GenerateAllBillsDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.generateAll(dto, dairyId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.remove(id, dairyId);
  }
}
