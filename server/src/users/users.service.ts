import { Injectable } from '@nestjs/common';
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
}
