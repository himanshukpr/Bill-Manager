import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateDairyDto, UpdateDairyDto, UpdateDairySettingsDto } from './dto/dairy.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class DairiesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.dairy.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        planExpiry: true,
        maxHouses: true,
        createdAt: true,
        _count: { select: { houses: true } },
      },
    });
  }

  async findOne(id: number) {
    const dairy = await this.prisma.dairy.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        planExpiry: true,
        maxHouses: true,
        createdAt: true,
      },
    });
    if (!dairy) throw new NotFoundException(`Dairy #${id} not found`);
    return dairy;
  }

  async findByEmail(email: string) {
    return this.prisma.dairy.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        planExpiry: true,
        maxHouses: true,
      },
    });
  }

  async create(dto: CreateDairyDto) {
    const emailExists = await this.prisma.dairy.findUnique({
      where: { email: dto.email },
    });
    if (emailExists) throw new ConflictException('Dairy email already in use');

    const hashed = await bcrypt.hash(dto.password, 10);
    const dairy = await this.prisma.dairy.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashed,
        phone: dto.phone,
        address: dto.address,
        ownerName: dto.ownerName ?? '',
        planExpiry: dto.planExpiry ? new Date(dto.planExpiry) : null,
        maxHouses: dto.maxHouses ?? null,
        users: {
          create: {
            username: dto.username,
            email: dto.email,
            password: hashed,
            role: 'admin',
            isVerified: true,
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        planExpiry: true,
        maxHouses: true,
        createdAt: true,
      },
    });

    return dairy;
  }

  async update(id: number, dto: UpdateDairyDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.planExpiry !== undefined) {
      data.planExpiry = dto.planExpiry ? new Date(dto.planExpiry) : null;
    }
    if (dto.maxHouses !== undefined) {
      data.maxHouses = dto.maxHouses;
    }
    return this.prisma.dairy.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        planExpiry: true,
        maxHouses: true,
        createdAt: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.dairy.delete({ where: { id } });
  }

  async resetPassword(id: number, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 10);
    await this.prisma.dairy.update({
      where: { id },
      data: { password: hashed },
    });
    return { success: true };
  }

  async getSettings(dairyId: number) {
    const dairy = await this.prisma.dairy.findUnique({
      where: { id: dairyId },
      select: { settings: true },
    });
    if (!dairy) throw new NotFoundException(`Dairy #${dairyId} not found`);
    return dairy.settings;
  }

  async updateSettings(dairyId: number, dto: UpdateDairySettingsDto) {
    const dairy = await this.prisma.dairy.update({
      where: { id: dairyId },
      data: { settings: dto as unknown as Prisma.InputJsonValue },
      select: { settings: true },
    });
    return dairy.settings;
  }
}
