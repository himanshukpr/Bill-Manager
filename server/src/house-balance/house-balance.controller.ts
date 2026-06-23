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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('house-balance')
export class HouseBalanceController {
  constructor(private service: HouseBalanceService) {}

  @Get('payments')
  getAllPaymentHistory(@CurrentUser('dairyId') dairyId: number) {
    return this.service.getAllPaymentHistory(dairyId);
  }

  @Get(':houseId')
  getBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.getBalance(houseId, dairyId);
  }

  @Get(':houseId/payments')
  getPaymentHistory(
    @Param('houseId', ParseIntPipe) houseId: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.getPaymentHistory(houseId, dairyId);
  }

  @Post('payment')
  recordPayment(
    @Body() dto: RecordPaymentDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.recordPayment(dto, dairyId);
  }

  @Patch('payment/:id')
  updatePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.updatePayment(id, dto, dairyId);
  }

  @Delete('payment/:id')
  deletePayment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.deletePayment(id, dairyId);
  }

  @Post('close-period')
  closePeriod(
    @Body() dto: ClosePeriodDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.closePeriod(dto, dairyId);
  }

  @Patch(':houseId')
  updatePreviousBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @Body() dto: UpdatePreviousBalanceDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.updatePreviousBalance(houseId, dto.previousBalance, dairyId);
  }

  @Patch(':houseId/current')
  updateCurrentBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @Body() dto: UpdateCurrentBalanceDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.updateCurrentBalance(houseId, dto.currentBalance, dairyId);
  }
}
