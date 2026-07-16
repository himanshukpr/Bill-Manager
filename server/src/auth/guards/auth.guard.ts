import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { uuid?: string } | undefined;
    if (!user?.uuid) return false;
    const dbUser = await this.prisma.user.findUnique({
      where: { uuid: user.uuid },
      select: { role: true },
    });
    return dbUser?.role === 'admin';
  }
}
