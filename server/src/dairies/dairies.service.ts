import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDairyDto, UpdateDairyDto } from './dto/dairy.dto';
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
        createdAt: true,
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
        createdAt: true,
      },
    });

    return dairy;
  }

  async update(id: number, dto: UpdateDairyDto) {
    await this.findOne(id);
    return this.prisma.dairy.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        ownerName: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.dairy.delete({ where: { id } });
  }
}
