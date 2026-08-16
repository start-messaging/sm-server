import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { RegisterFcmWebTokenDto } from '../dto/register-fcm-web-token.dto';
import { FcmPushService } from '../services/fcm-push.service';
import { FcmWebTokensService } from '../services/fcm-web-tokens.service';

@ApiTags('push')
@Controller({ path: 'me/push/fcm-web', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FcmWebTokensController {
  constructor(
    private readonly tokens: FcmWebTokensService,
    private readonly fcm: FcmPushService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether server-side FCM sending is configured' })
  status() {
    return { enabled: this.fcm.isEnabled() };
  }

  @Post()
  @ApiOperation({ summary: 'Register this browser for FCM web push' })
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterFcmWebTokenDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.tokens.register(
      user.id,
      dto.token,
      userAgent?.slice(0, 512) ?? null,
    );
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Unregister this browser from FCM web push' })
  async unregister(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RegisterFcmWebTokenDto,
  ): Promise<void> {
    await this.tokens.unregister(user.id, dto.token);
  }
}
