import { Injectable, ConflictException, NotFoundException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { DairiesService } from '../dairies/dairies.service';
import { RegisterDto, DairyRegisterDto, DairyLoginDto } from './dto/auth.dto';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private dairiesService: DairiesService,
    private prisma: PrismaService,
  ) {}

  async validateUser(username: string, password: string, dairyId?: number) {
    const user = dairyId
      ? await this.usersService.findByUsernameInDairy(username, dairyId)
      : await this.usersService.findByUsername(username);

    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async register(dto: RegisterDto & { dairyId: number }) {
    
    const usernameExists = dto.dairyId
      ? await this.usersService.findByUsernameInDairy(dto.username, dto.dairyId)
      : await this.usersService.findByUsername(dto.username);
    if (usernameExists) throw new ConflictException('Username already taken');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashed,
      role: dto.role ?? Role.supplier,
      dairyId: dto.dairyId,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async dairyRegister(dto: DairyRegisterDto) {
    const dairy = await this.dairiesService.create({
      name: dto.dairyName,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      username: dto.username,
      password: dto.password,
      ownerName: dto.ownerName,
    });

    const dairyUser = await this.usersService.findByUsernameInDairy(dto.username, dairy.id);
    if (!dairyUser) throw new NotFoundException('Failed to create dairy admin user');

    return this.login({
      uuid: dairyUser.uuid,
      username: dairyUser.username,
      email: dairyUser.email ?? undefined,
      role: dairyUser.role,
      isVerified: dairyUser.isVerified,
      permissions: (dairyUser.permissions ?? {}) as Record<string, boolean>,
      dairyId: dairy.id,
    });
  }

  async dairyLogin(dto: DairyLoginDto) {
    const dairy = await this.dairiesService.findByEmail(dto.email);
    if (!dairy) throw new UnauthorizedException('Invalid dairy credentials');

    const isMatch = await bcrypt.compare(dto.password, dairy.password);
    if (!isMatch) throw new UnauthorizedException('Invalid dairy credentials');

    if (!dairy.isActive) throw new UnauthorizedException('Dairy is inactive');

    if (dairy.planExpiry && new Date(dairy.planExpiry) < new Date()) {
      const expiryDate = new Date(dairy.planExpiry).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      throw new UnauthorizedException(`Your dairy plan expired on ${expiryDate}. Please contact the team to renew.`);
    }

    const token = this.jwtService.sign({
      dairyId: dairy.id,
      type: 'dairy',
    });

    return {
      access_token: token,
      dairy: {
        id: dairy.id,
        name: dairy.name,
        email: dairy.email,
        planExpiry: dairy.planExpiry?.toISOString() ?? null,
        maxHouses: dairy.maxHouses,
      },
    };
  }

  async login(user: {
    uuid: string;
    username: string;
    email?: string;
    role: string;
    isVerified: boolean;
    permissions?: Record<string, boolean>;
    dairyId?: number;
  }) {
    let planExpiry: string | null = null;
    let maxHouses: number | null = null;

    if (user.dairyId) {
      const dairy = await this.prisma.dairy.findUnique({
        where: { id: user.dairyId },
        select: { planExpiry: true, maxHouses: true },
      });
      planExpiry = dairy?.planExpiry?.toISOString() ?? null;
      maxHouses = dairy?.maxHouses ?? null;
    }

    const payload = {
      sub: user.uuid,
      username: user.username,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      permissions: user.permissions ?? {},
      dairyId: user.dairyId ?? 0,
      planExpiry: planExpiry ?? undefined,
      maxHouses: maxHouses ?? undefined,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        ...user,
        planExpiry,
        maxHouses,
      },
    };
  }

  async getMe(uuid: string) {
    const user = await this.usersService.findById(uuid);
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async impersonate(adminUuid: string, targetUuid: string, adminDairyId: number) {
    const target = await this.usersService.findById(targetUuid);
    if (!target) throw new NotFoundException('User not found');
    if (target.role !== Role.supplier) throw new ForbiddenException('Can only impersonate supplier accounts');
    if (target.dairyId !== adminDairyId) throw new ForbiddenException('Cannot impersonate users from another dairy');

    const permissions = (target.permissions ?? {}) as Record<string, boolean>;
    const payload = {
      sub: target.uuid,
      username: target.username,
      email: target.email,
      role: target.role,
      isVerified: target.isVerified,
      permissions,
      impersonator: adminUuid,
      dairyId: target.dairyId,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        uuid: target.uuid,
        username: target.username,
        email: target.email,
        role: target.role,
        isVerified: target.isVerified,
        permissions,
        dairyId: target.dairyId,
      },
    };
  }
}
