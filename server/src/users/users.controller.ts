import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard, AdminGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(
    @CurrentUser('dairyId') dairyId: number,
    @Query('role') role?: Role,
  ) {
    return this.usersService.findAll(dairyId, role);
  }

  @UseGuards(AdminGuard)
  @Patch(':uuid/verify')
  verify(
    @Param('uuid') uuid: string,
    @Body('isVerified') isVerified: boolean,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.usersService.verify(uuid, isVerified, dairyId);
  }

  @UseGuards(AdminGuard)
  @Patch(':uuid/role')
  changeRole(
    @Param('uuid') uuid: string,
    @Body('role') role: Role,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.usersService.changeRole(uuid, role, dairyId);
  }

  @UseGuards(AdminGuard)
  @Patch(':uuid/permissions')
  updatePermissions(
    @Param('uuid') uuid: string,
    @Body() permissions: Record<string, boolean>,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.usersService.updatePermissions(uuid, permissions, dairyId);
  }

  @UseGuards(AdminGuard)
  @Patch(':uuid/reset-password')
  resetPassword(
    @Param('uuid') uuid: string,
    @Body('password') password: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.usersService.resetPassword(uuid, password, dairyId);
  }

  @UseGuards(AdminGuard)
  @Delete(':uuid')
  remove(
    @Param('uuid') uuid: string,
    @CurrentUser('dairyId') dairyId: number,
  ) {
    return this.usersService.remove(uuid, dairyId);
  }
}
