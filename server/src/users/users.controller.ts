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
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  findAll(@Query('role') role?: Role) {
    return this.usersService.findAll(role);
  }

  @Patch(':uuid/verify')
  verify(
    @Param('uuid') uuid: string,
    @Body('isVerified') isVerified: boolean,
  ) {
    return this.usersService.verify(uuid, isVerified);
  }

  @Patch(':uuid/role')
  changeRole(
    @Param('uuid') uuid: string,
    @Body('role') role: Role,
  ) {
    return this.usersService.changeRole(uuid, role);
  }

  @Delete(':uuid')
  remove(@Param('uuid') uuid: string) {
    return this.usersService.remove(uuid);
  }
}
