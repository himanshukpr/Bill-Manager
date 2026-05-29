import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/auth.dto';
import { LocalAuthGuard, JwtAuthGuard, AdminGuard } from './guards/auth.guard';

interface AuthenticatedRequest {
  user: {
    uuid: string;
    username: string;
    email: string;
    role: string;
    isVerified: boolean;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/register
   * Body: { username, email, password, role? }
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Body: { username, password }
   * LocalStrategy validates credentials and attaches user to request
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Request() req: AuthenticatedRequest) {
    return this.authService.login(req.user);
  }

  /**
   * GET /auth/me
   * Protected route — returns the currently authenticated user from JWT
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.uuid);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('impersonate/:uuid')
  @HttpCode(HttpStatus.OK)
  async impersonate(
    @Request() req: AuthenticatedRequest,
    @Param('uuid') uuid: string,
  ) {
    return this.authService.impersonate(req.user.uuid, uuid);
  }
}
