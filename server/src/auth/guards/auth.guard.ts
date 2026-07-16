import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: string; username?: string; uuid?: string } | undefined;
    console.log('[AdminGuard] user:', JSON.stringify({ uuid: user?.uuid, username: user?.username, role: user?.role }));
    return user?.role === 'admin';
  }
}
