import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async listAllUsers() {
    return this.usersService.getAllUsersWithCount();
  }

  @Post(':uuid/verify')
  async verifyUser(@Param('uuid', new ParseUUIDPipe()) uuid: string) {
    return this.usersService.verifyUser(uuid);
  }

  @Delete(':uuid')
  async deleteUser(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Request() req: any,
  ) {
    return this.usersService.deleteUserByAdmin(uuid, req.user.uuid);
  }
}
