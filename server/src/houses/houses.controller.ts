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
import { HousesService } from './houses.service';
import { CreateHouseDto, UpdateHouseDto } from './dto/house.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('houses')
export class HousesController {
  constructor(private housesService: HousesService) {}

  @Get()
  findAll() {
    return this.housesService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.housesService.getStats();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.housesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateHouseDto) {
    return this.housesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHouseDto) {
    return this.housesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.housesService.remove(id);
  }
}
