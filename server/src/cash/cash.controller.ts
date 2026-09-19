import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { CashService } from './cash.service';
import type { CashRequester } from './cash.service';
import {
  CreateCashHouseDto,
  UpdateCashHouseDto,
  ReorderCashHousesDto,
} from './dto/cash-house.dto';
import { CreateCashLogDto } from './dto/cash-log.dto';
import {
  CreateCashPaymentDto,
  UpdateCashPaymentDto,
} from './dto/cash-payment.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('cash')
export class CashController {
  constructor(private cashService: CashService) {}

  // ─── Houses ────────────────────────────────────────────────────────

  @Get('houses')
  findAllHouses(@CurrentUser() user: CashRequester) {
    return this.cashService.findAllHouses(user);
  }

  @Post('houses')
  @HttpCode(HttpStatus.CREATED)
  createHouse(
    @Body() dto: CreateCashHouseDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.createHouse(dto, user);
  }

  @Patch('houses/reorder')
  reorderHouses(
    @Body() dto: ReorderCashHousesDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.reorderHouses(dto.ids, user);
  }

  @Get('houses/:id')
  findOneHouse(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.findOneHouse(id, user);
  }

  @Patch('houses/:id')
  updateHouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashHouseDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.updateHouse(id, dto, user);
  }

  @Delete('houses/:id')
  deleteHouse(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.deleteHouse(id, user);
  }

  // ─── Logs ──────────────────────────────────────────────────────────

  @Get('logs')
  findLogs(
    @Query('houseId', ParseIntPipe) houseId: number,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.findLogs(houseId, user);
  }

  @Post('logs')
  @HttpCode(HttpStatus.CREATED)
  createLog(
    @Body() dto: CreateCashLogDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.createLog(dto, user);
  }

  @Delete('logs/:id')
  deleteLog(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.deleteLog(id, user);
  }

  // ─── Payments ──────────────────────────────────────────────────────

  @Get('payments')
  findPayments(
    @CurrentUser() user: CashRequester,
    @Query('houseId') houseId?: string,
  ) {
    const parsed =
      houseId === undefined || houseId === '' ? undefined : Number(houseId);
    return this.cashService.findPayments(
      parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
      user,
    );
  }

  @Post('payments')
  @HttpCode(HttpStatus.CREATED)
  createPayment(
    @Body() dto: CreateCashPaymentDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.createPayment(dto, user);
  }

  @Patch('payments/:id')
  updatePayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCashPaymentDto,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.updatePayment(id, dto, user);
  }

  @Delete('payments/:id')
  deletePayment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CashRequester,
  ) {
    return this.cashService.deletePayment(id, user);
  }

  // ─── Stats & suppliers ─────────────────────────────────────────────

  @Get('stats')
  getStats(@CurrentUser() user: CashRequester) {
    return this.cashService.getStats(user);
  }

  @Get('suppliers')
  listSuppliers(@CurrentUser() user: CashRequester) {
    return this.cashService.listSuppliers(user);
  }
}
