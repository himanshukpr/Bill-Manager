import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Body,
  UseGuards,
} from '@nestjs/common';
import { HouseBalanceService } from './house-balance.service';
import { RecordPaymentDto } from './dto/payment.dto';
import { UpdateHouseBalanceDto } from './dto/balance.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('house-balance')
export class HouseBalanceController {
  constructor(private service: HouseBalanceService) { }

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

  @Patch(':houseId')
  updateBalance(
    @Param('houseId', ParseIntPipe) houseId: number,
    @Body() dto: UpdateHouseBalanceDto,
  ) {
    return this.service.updateBalance(houseId, dto);
  }

  @Post('payment')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto);
  }
}
