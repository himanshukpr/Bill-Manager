import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { HouseBalanceService } from './house-balance.service';
import {
  RecordPaymentDto,
  UpdatePreviousBalanceDto,
  UpdateCurrentBalanceDto,
  UpdatePaymentDto,
} from './dto/payment.dto';
import { ClosePeriodDto } from './dto/close-period.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('house-balance')
export class HouseBalanceController {
  constructor(private service: HouseBalanceService) {}

  @Get('payments')
  getAllPaymentHistory() {
    return this.service.getAllPaymentHistory();
  }

  @Get(':houseId')
  getBalance(@Param('houseId', ParseIntPipe) houseId: number) {
    return this.service.getBalance(houseId);
  }

  @Get(':houseId/payments')
  getPaymentHistory(@Param('houseId', ParseIntPipe) houseId: number) {
    return this.service.getPaymentHistory(houseId);
  }

  @Post('payment')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto);
  }

  @Patch('payment/:id')
  updatePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentDto,
  ) {
    return this.service.updatePayment(id, dto);
  }

  @Delete('payment/:id')
  deletePayment(@Param('id', ParseIntPipe) id: number) {
    return this.service.deletePayment(id);
  }

  @Post('close-period')
  closePeriod(@Body() dto: ClosePeriodDto) {
    return this.service.closePeriod(dto);
  }

  @Patch(':houseId')
  updatePreviousBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @Body() dto: UpdatePreviousBalanceDto,
  ) {
    return this.service.updatePreviousBalance(houseId, dto.previousBalance);
  }

  @Patch(':houseId/current')
  updateCurrentBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @Body() dto: UpdateCurrentBalanceDto,
  ) {
    return this.service.updateCurrentBalance(houseId, dto.currentBalance);
  }
}
