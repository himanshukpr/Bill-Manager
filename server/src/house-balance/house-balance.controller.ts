import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { HouseBalanceService } from './house-balance.service';
import { RecordPaymentDto } from './dto/payment.dto';
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

  @Post('payment')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.service.recordPayment(dto);
  }
}
