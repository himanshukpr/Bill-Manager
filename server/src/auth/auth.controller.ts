import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { LocalAuthGuard, JwtAuthGuard } from './guards/auth.guard';

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
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  /**
   * GET /auth/me
   * Protected route — returns the currently authenticated user from JWT
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: any) {
    return this.authService.getMe(req.user.uuid);
  }
}
