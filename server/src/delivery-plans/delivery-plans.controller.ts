import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDeliveryPlanDto } from './dto/delivery-plan.dto';
import { DeliveryPlansService } from './delivery-plans.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-plans')
export class DeliveryPlansController {
  constructor(private service: DeliveryPlansService) {}

  @Get()
  findAll(@CurrentUser() user?: any) {
    return this.service.findAll(user);
  }

  @Post()
  create(
    @Body() dto: CreateDeliveryPlanDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(dto, user);
  }
}
