import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  username: string;
  email: string;
  role: string;
  isVerified: boolean;
  permissions?: Record<string, boolean>;
  impersonator?: string;
  dairyId: number;
  planExpiry?: string;
  maxHouses?: number;
}

const planCache = new Map<number, { expiry: Date | null; checkedAt: number }>();
const PLAN_CACHE_TTL_MS = 60_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.dairyId) {
      const now = Date.now();
      const cached = planCache.get(payload.dairyId);
      let dairyExpiry: Date | null;

      if (cached && now - cached.checkedAt < PLAN_CACHE_TTL_MS) {
        dairyExpiry = cached.expiry;
      } else {
        const dairy = await this.prisma.dairy.findUnique({
          where: { id: payload.dairyId },
          select: { planExpiry: true },
        });
        dairyExpiry = dairy?.planExpiry ?? null;
        planCache.set(payload.dairyId, { expiry: dairyExpiry, checkedAt: now });
      }

      if (dairyExpiry && new Date(dairyExpiry).getTime() < now) {
        planCache.delete(payload.dairyId);
        throw new UnauthorizedException('PLAN_EXPIRED');
      }
    }

    return {
      uuid: payload.sub,
      username: payload.username,
      email: payload.email,
      role: payload.role,
      isVerified: payload.isVerified,
      permissions: payload.permissions ?? {},
      impersonator: payload.impersonator,
      dairyId: payload.dairyId,
      planExpiry: payload.planExpiry,
      maxHouses: payload.maxHouses,
    };
  }
}
