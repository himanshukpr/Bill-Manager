import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'username',
      passReqToCallback: true,
    });
  }

  async validate(request: { body: { dairyId?: number | string } }, username: string, password: string) {
    const rawDairyId = request.body?.dairyId;
    const dairyId = rawDairyId != null ? Number(rawDairyId) : undefined;
    const user = await this.authService.validateUser(username, password, dairyId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
