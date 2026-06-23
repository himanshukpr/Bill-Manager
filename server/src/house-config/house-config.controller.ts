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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('house-config')
export class HouseConfigController {
  constructor(private service: HouseConfigService) {}

  @Get()
  findAll(
    @Query('supplierId') supplierId?: string,
    @CurrentUser('dairyId') dairyId?: number,
  ) {
    return this.service.findAll(supplierId, dairyId);
  }

  @Get('house/:houseId')
  findByHouse(
    @Param('houseId', ParseIntPipe) houseId: number,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.findByHouse(houseId, dairyId);
  }

  @Post()
  create(
    @Body() dto: CreateHouseConfigDto,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.service.create(dto, dairyId);
  }

  @Patch('reorder')
  async reorder(
    @Body() dto: ReorderConfigDto,
    @CurrentUser() user: { uuid: string; role: string; dairyId: number },
  ) {
    return this.service.reorder(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHouseConfigDto,
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
