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
} from '@nestjs/common';
import { HousesService } from './houses.service';
import {
  CreateHouseDto,
  UpdateHouseDto,
  UpdateHouseLocationDto,
} from './dto/house.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('houses')
export class HousesController {
  constructor(private housesService: HousesService) {}

  @Get()
  findAll(@CurrentUser('dairyId') dairyId: number) {
    return this.housesService.findAll(dairyId);
  }

  @Get('stats')
  getStats(@CurrentUser('dairyId') dairyId: number) {
    return this.housesService.getStats(dairyId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.findOne(+id, dairyId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateHouseDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.create(dto, dairyId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHouseDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.update(+id, dto, dairyId);
  }

  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @Body() dto: UpdateHouseLocationDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.updateLocation(+id, dto, dairyId);
  }

  @Patch(':id/deactivate')
  deactivate(
    @Param('id') id: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.deactivate(+id, dairyId);
  }

  @Patch(':id/reactivate')
  reactivate(
    @Param('id') id: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.reactivate(+id, dairyId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.housesService.delete(+id, dairyId);
  }
}
