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
import { CurrentPartner } from './decorators/current-partner.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ReferralJwtGuard } from './guards/referral-jwt.guard';
import { ReferralAuthService } from './referral-auth.service';
import type { AuthenticatedPartner } from './strategies/referral-jwt.strategy';

@ApiTags('referral-auth')
@Controller({ path: 'referral/auth', version: '1' })
export class ReferralAuthController {
  constructor(private readonly referralAuth: ReferralAuthService) {}

  @Post('register')
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'EMAIL_TAKEN' })
  register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return this.referralAuth.register(dto, { ip });
  }

  @Post('verify-otp')
  @HttpCode(200)
  @ApiErrorResponse({ status: 400, code: 'OTP_INVALID' })
  @ApiErrorResponse({ status: 429, code: 'OTP_LOCKED' })
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.referralAuth.verifyOtp(dto, { ip, userAgent });
  }

  @Post('login')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'INVALID_CREDENTIALS' })
  @ApiErrorResponse({ status: 403, code: 'PARTNER_NOT_VERIFIED' })
  login(
    @Body() dto: LoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.referralAuth.login(dto, { ip, userAgent });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'SESSION_INVALID' })
  refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.referralAuth.refresh(dto.refreshToken, { ip, userAgent });
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(ReferralJwtGuard)
  @ApiBearerAuth()
  async logout(@CurrentPartner() partner: AuthenticatedPartner): Promise<void> {
    await this.referralAuth.logout(partner.sessionId);
  }

  @Get('me')
  @UseGuards(ReferralJwtGuard)
  @ApiBearerAuth()
  me(@CurrentPartner() partner: AuthenticatedPartner) {
    return this.referralAuth.me(partner.id);
  }
}
