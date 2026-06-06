import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
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

  async findAll(role?: Role) {
    const where = role ? { role } : {};
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
        isVerified: true,
        createdAt: true,
        permissions: true,
      },
    });
  }

  async updatePermissions(uuid: string, permissions: Record<string, boolean>) {
    return this.prisma.user.update({
      where: { uuid },
      data: { permissions },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
        isVerified: true,
        permissions: true,
      },
    });
  }

  async verify(uuid: string, isVerified: boolean) {
    return this.prisma.user.update({
      where: { uuid },
      data: { isVerified },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
        isVerified: true,
      },
    });
  }

  async changeRole(uuid: string, role: Role) {
    return this.prisma.user.update({
      where: { uuid },
      data: { role },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
        isVerified: true,
      },
    });
  }

  async remove(uuid: string) {
    try {
      return await this.prisma.user.delete({ where: { uuid } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
      ) {
        if (error.code === 'P2003') {
          throw new BadRequestException(
            'Cannot delete user: they have existing house configs, delivery logs, or delivery plans. Remove those associations first.',
          );
        }
        if (error.code === 'P2025') {
          throw new BadRequestException('User not found or already deleted.');
        }
      }
      throw error;
    }
  }
}
