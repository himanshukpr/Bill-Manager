import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DairiesService } from './dairies.service';
import { CreateDairyDto, UpdateDairyDto, UpdateDairySettingsDto } from './dto/dairy.dto';
import { JwtAuthGuard, AdminGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('dairies')
export class DairiesController {
  constructor(private dairiesService: DairiesService) {}

  @Get()
  findAll() {
    return this.dairiesService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  getSettings(@CurrentUser('dairyId') dairyId: number) {
    return this.dairiesService.getSettings(dairyId);
  }

  @UseGuards(JwtAuthGuard)
  @Put('settings')
  updateSettings(
    @CurrentUser('dairyId') dairyId: number,
    @Body() dto: UpdateDairySettingsDto,
  ) {
    return this.dairiesService.updateSettings(dairyId, dto);
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

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/password')
  resetPassword(@Param('id') id: string, @Body() body: { password: string }) {
    return this.dairiesService.resetPassword(+id, body.password);
  }
}