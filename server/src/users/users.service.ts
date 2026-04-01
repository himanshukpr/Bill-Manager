import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({ where: { username } });
  }

  async findById(uuid: string) {
    return this.prisma.user.findUnique({ where: { uuid } });
  }

  async create(data: {
    username: string;
    email: string;
    password: string;
    role?: Role;
    isVerified?: boolean;
  }) {
    return this.prisma.user.create({ data });
  }

  async getAllUsersWithCount() {
    const [count, users] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          uuid: true,
          username: true,
          email: true,
          role: true,
          isVerified: true,
          createdAt: true,
        },
      }),
    ]);

    return { count, users };
  }

  async verifyUser(uuid: string) {
    const user = await this.prisma.user.update({
      where: { uuid },
      data: { isVerified: true },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
        isVerified: true,
        createdAt: true,
      },
    });

    return {
      message: 'User verified successfully',
      user,
    };
  }

  async deleteUserByAdmin(targetUuid: string, adminUuid: string) {
    if (targetUuid === adminUuid) {
      throw new BadRequestException('Admin cannot delete own account');
    }

    const existing = await this.prisma.user.findUnique({
      where: { uuid: targetUuid },
      select: { uuid: true, username: true, email: true, role: true },
    });

    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.delete({ where: { uuid: targetUuid } });

    return {
      message: 'User deleted successfully',
      user: existing,
    };
  }
}
