import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HouseConfigService } from './house-config.service';
import {
  CreateHouseConfigDto,
  UpdateHouseConfigDto,
  ReorderConfigDto,
} from './dto/house-config.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('house-config')
export class HouseConfigController {
  constructor(private service: HouseConfigService) {}

  @Get()
  findAll(@Query('supplierId') supplierId?: string) {
    return this.service.findAll(supplierId);
  }

  @Get('house/:houseId')
  findByHouse(@Param('houseId', ParseIntPipe) houseId: number) {
    return this.service.findByHouse(houseId);
  }

  @Post()
  create(@Body() dto: CreateHouseConfigDto) {
    return this.service.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() dto: ReorderConfigDto) {
    return this.service.reorder(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHouseConfigDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
