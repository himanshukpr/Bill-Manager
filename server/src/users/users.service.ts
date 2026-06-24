import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByUsername(username: string) {
    // Returns first match (fallback for backward compat / non-dairy queries)
    return this.prisma.user.findFirst({ where: { username } });
  }

  async findByUsernameInDairy(username: string, dairyId: number) {
    return this.prisma.user.findFirst({
      where: { username, dairyId },
    });
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
    dairyId?: number;
  }) {
    return this.prisma.user.create({ data: data as any });
  }

  async findAll(dairyId: number, role?: Role) {
    const where: { role?: Role; dairyId: number } = { dairyId };
    if (role) where.role = role;
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
        dairyId: true,
      },
    });
  }

  async updatePermissions(uuid: string, permissions: Record<string, boolean>, dairyId: number) {
    const user = await this.prisma.user.findFirst({ where: { uuid, dairyId } });
    if (!user) throw new BadRequestException('User not found in this dairy.');
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

  async verify(uuid: string, isVerified: boolean, dairyId: number) {
    const user = await this.prisma.user.findFirst({ where: { uuid, dairyId } });
    if (!user) throw new BadRequestException('User not found in this dairy.');
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

  async changeRole(uuid: string, role: Role, dairyId: number) {
    const user = await this.prisma.user.findFirst({ where: { uuid, dairyId } });
    if (!user) throw new BadRequestException('User not found in this dairy.');
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

  async resetPassword(uuid: string, newPassword: string, dairyId: number) {
    const user = await this.prisma.user.findFirst({ where: { uuid, dairyId } });
    if (!user) throw new BadRequestException('User not found in this dairy.');
    const hashed = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { uuid },
      data: { password: hashed },
      select: {
        uuid: true,
        username: true,
        email: true,
        role: true,
      },
    });
  }

  async remove(uuid: string, dairyId: number) {
    const user = await this.prisma.user.findFirst({ where: { uuid, dairyId } });
    if (!user) throw new BadRequestException('User not found in this dairy.');
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
