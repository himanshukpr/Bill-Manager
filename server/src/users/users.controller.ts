import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private assertAdmin(req: any) {
    if (req?.user?.role !== 'admin') {
      throw new ForbiddenException('Only admin users can access this resource');
    }
  }

  @Get()
  async listAllUsers(@Request() req: any) {
    this.assertAdmin(req);
    return this.usersService.getAllUsersWithCount();
  }

  @Post(':uuid/verify')
  async verifyUser(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Request() req: any,
  ) {
    this.assertAdmin(req);
    return this.usersService.verifyUser(uuid);
  }

  @Delete(':uuid')
  async deleteUser(
    @Param('uuid', new ParseUUIDPipe()) uuid: string,
    @Request() req: any,
  ) {
    this.assertAdmin(req);

    if (!req?.user?.uuid) {
      throw new BadRequestException('Invalid admin user context');
    }

    return this.usersService.deleteUserByAdmin(uuid, req.user.uuid);
  }
}