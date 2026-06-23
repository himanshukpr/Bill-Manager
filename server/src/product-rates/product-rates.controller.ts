import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  CreateProductRateDto,
  ReorderProductRatesDto,
  UpdateProductRateDto,
} from './dto/product-rate.dto';
import { ProductRatesService } from './product-rates.service';

@UseGuards(JwtAuthGuard)
@Controller('product-rates')
export class ProductRatesController {
  constructor(private service: ProductRatesService) {}

  @Get()
  findAll(@CurrentUser('dairyId') dairyId: number) {
    return this.service.findAll(dairyId);
  }

  @Post()
  create(
    @Body() dto: CreateProductRateDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.create(dto, dairyId);
  }

  @Post('reorder')
  reorder(
    @Body() dto: ReorderProductRatesDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.reorder(dto.ids, dairyId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductRateDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.update(id, dto, dairyId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.remove(id, dairyId);
  }
}
