import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DairiesService } from './dairies.service';
import { CreateDairyDto, UpdateDairyDto } from './dto/dairy.dto';
import { JwtAuthGuard, AdminGuard } from '../auth/guards/auth.guard';

@Controller('dairies')
export class DairiesController {
  constructor(private dairiesService: DairiesService) {}

  @Get()
  findAll() {
    return this.dairiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.dairiesService.findOne(+id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateDairyDto) {
    return this.dairiesService.create(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDairyDto) {
    return this.dairiesService.update(+id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dairiesService.remove(+id);
  }
}
