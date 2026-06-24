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
import { RegisterDto, DairyLoginDto } from './dto/auth.dto';
import { LocalAuthGuard, JwtAuthGuard, AdminGuard } from './guards/auth.guard';

interface AuthenticatedRequest {
  user: {
    uuid: string;
    username: string;
    email: string;
    role: string;
    isVerified: boolean;
    dairyId: number;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /**
   * POST /auth/register
   * Body: { username, email, password, role?, dairyId? }
   * Creates a new user within a dairy.
   */
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/dairy/login
   * Body: { email, password }
   * Authenticates the dairy itself (not a user). Returns a dairy-scoped token.
   */
  @Post('dairy/login')
  @HttpCode(HttpStatus.OK)
  async dairyLogin(@Body() dto: DairyLoginDto) {
    return this.authService.dairyLogin(dto);
  }

  /**
   * POST /auth/login
   * Body: { username, password, dairyId? }
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
    return this.authService.impersonate(req.user.uuid, uuid, req.user.dairyId);
  }
}
