import { Injectable, ConflictException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/auth.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);

    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async register(dto: RegisterDto) {
    // Check for existing email / username
    const emailExists = await this.usersService.findByEmail(dto.email);
    if (emailExists) throw new ConflictException('Email already in use');

    const usernameExists = await this.usersService.findByUsername(dto.username);
    if (usernameExists) throw new ConflictException('Username already taken');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create({
      username: dto.username,
      email: dto.email,
      password: hashed,
      role: dto.role ?? Role.supplier,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  login(user: {
    uuid: string;
    username: string;
    email: string;
    role: string;
    isVerified: boolean;
    permissions?: Record<string, boolean>;
  }) {
    const payload = {
      sub: user.uuid,
      username: user.username,
      email: user.email,
      role: user.role,
      isVerified: user.isVerified,
      permissions: user.permissions ?? {},
    };
    return {
      access_token: this.jwtService.sign(payload),
      user,
    };
  }

  async getMe(uuid: string) {
    const user = await this.usersService.findById(uuid);
    if (!user) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _pw, ...result } = user;
    return result;
  }

  async impersonate(adminUuid: string, targetUuid: string) {
    const target = await this.usersService.findById(targetUuid);
    if (!target) throw new NotFoundException('User not found');
    if (target.role !== Role.supplier) throw new ForbiddenException('Can only impersonate supplier accounts');

    const permissions = (target.permissions ?? {}) as Record<string, boolean>;
    const payload = {
      sub: target.uuid,
      username: target.username,
      email: target.email,
      role: target.role,
      isVerified: target.isVerified,
      permissions,
      impersonator: adminUuid,
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
      },
    };
  }
}
