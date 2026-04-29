import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CreateDeliveryPlanDto } from './dto/delivery-plan.dto';
import { DeliveryPlansService } from './delivery-plans.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-plans')
export class DeliveryPlansController {
  constructor(private service: DeliveryPlansService) { }

  @Get()
  findAll(@Request() req?: any) {
    return this.service.findAll(req?.user);
  }

  @Post()
  create(@Body() dto: CreateDeliveryPlanDto, @Request() req: any) {
    return this.service.create(dto, req.user);
  }
}