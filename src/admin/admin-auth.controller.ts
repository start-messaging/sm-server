import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Ip,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AdminAuthService } from './admin-auth.service';
import { CurrentStaff } from './decorators/current-staff.decorator';
import { StaffAuth } from './decorators/staff-auth.decorator';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { RefreshDto } from './dto/refresh.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import type { AuthenticatedStaff } from './strategies/staff-jwt.strategy';

@ApiTags('admin-auth')
@Controller({ path: 'admin/auth', version: '1' })
export class AdminAuthController {
  constructor(private readonly adminAuth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'INVALID_CREDENTIALS' })
  @ApiErrorResponse({ status: 403, code: 'ACCOUNT_SUSPENDED' })
  login(
    @Body() dto: StaffLoginDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.adminAuth.login(dto, { ip, userAgent });
  }

  @Post('accept-invite')
  @HttpCode(200)
  @ApiErrorResponse({ status: 400, code: 'INVITE_INVALID' })
  acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.adminAuth.acceptInvite(dto.token, dto.password, {
      ip,
      userAgent,
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiErrorResponse({ status: 401, code: 'SESSION_INVALID' })
  refresh(
    @Body() dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.adminAuth.refresh(dto.refreshToken, { ip, userAgent });
  }

  @Post('logout')
  @HttpCode(204)
  @StaffAuth()
  async logout(@CurrentStaff() staff: AuthenticatedStaff): Promise<void> {
    await this.adminAuth.logout(staff.sessionId);
  }

  @Get('me')
  @StaffAuth()
  me(@CurrentStaff() staff: AuthenticatedStaff) {
    return this.adminAuth.me(staff.id);
  }
}
