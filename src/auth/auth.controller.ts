import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('signup')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'EMAIL_TAKEN' })
  signup(@Body() dto: SignupDto, @Ip() ip: string) {
    return this.auth.signup(dto, { ip });
  }

  @Post('verify-otp')
  @HttpCode(200)
  @ApiErrorResponse({ status: 400, code: 'OTP_INVALID' })
  @ApiErrorResponse({ status: 400, code: 'OTP_EXPIRED' })
  @ApiErrorResponse({ status: 429, code: 'OTP_LOCKED' })
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.verifyOtp(dto, { ip, userAgent });
  }

  @Post('login')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'INVALID_CREDENTIALS' })
  @ApiErrorResponse({ status: 403, code: 'USER_NOT_VERIFIED' })
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.login(dto, { ip, userAgent });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'SESSION_INVALID' })
  refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.refresh(dto.refreshToken, { ip, userAgent });
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.auth.logout(user.sessionId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.me(user.id);
  }
}
