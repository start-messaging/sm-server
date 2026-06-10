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
import { ResendOtpDto } from './dto/resend-otp.dto';
import { SetMobileDto } from './dto/set-mobile.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MobileVerificationService } from './mobile-verification.service';
import { OtpResendService } from './otp-resend.service';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mobile: MobileVerificationService,
    private readonly resend: OtpResendService,
  ) {}

  // Re-posting an UNVERIFIED email resumes that registration (201, fresh
  // token) instead of 409 — EMAIL_TAKEN is only for verified accounts.
  @Post('signup')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'EMAIL_TAKEN' })
  @ApiErrorResponse({ status: 429, code: 'OTP_COOLDOWN' })
  signup(@Body() dto: SignupDto, @Ip() ip: string) {
    return this.auth.signup(dto, { ip });
  }

  // Public by design: the token (not a password) is the capability, so a
  // reloaded signup wizard can ask for a new code. Email/SIGNUP only — this
  // unauthenticated route must never trigger SMS.
  @Post('resend-otp')
  @HttpCode(200)
  @ApiErrorResponse({ status: 400, code: 'OTP_INVALID' })
  @ApiErrorResponse({ status: 409, code: 'EMAIL_ALREADY_VERIFIED' })
  @ApiErrorResponse({ status: 429, code: 'OTP_COOLDOWN' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.resend.resendSignupOtp(dto);
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

  // USER_NOT_VERIFIED (correct password, unverified email) carries recovery
  // details: { email, verificationToken, expiresInSec, resendCooldownSec,
  // devCode? } so the client can resume the email-OTP step.
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

  @Post('mobile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'MOBILE_INVALID' })
  @ApiErrorResponse({ status: 400, code: 'MOBILE_COUNTRY_UNRESOLVED' })
  @ApiErrorResponse({ status: 400, code: 'COUNTRY_NOT_SUPPORTED' })
  @ApiErrorResponse({ status: 409, code: 'MOBILE_TAKEN' })
  @ApiErrorResponse({ status: 409, code: 'MOBILE_ALREADY_VERIFIED' })
  @ApiErrorResponse({ status: 429, code: 'OTP_COOLDOWN' })
  setMobile(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetMobileDto) {
    return this.mobile.setMobile(user.id, dto);
  }

  @Post('verify-mobile-otp')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 400, code: 'OTP_INVALID' })
  @ApiErrorResponse({ status: 400, code: 'OTP_EXPIRED' })
  @ApiErrorResponse({ status: 429, code: 'OTP_LOCKED' })
  @ApiErrorResponse({ status: 409, code: 'MOBILE_TAKEN' })
  verifyMobileOtp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyOtpDto,
  ) {
    return this.mobile.verifyMobileOtp(user.id, dto);
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
