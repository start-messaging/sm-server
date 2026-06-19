import {
  Body,
  Controller,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { ClaimInviteDto } from './dto/claim-invite.dto';
import { MemberInviteService } from './member-invite.service';

/**
 * Token-based invite acceptance, OUTSIDE any workspace guard (the token is the
 * authority). `preview` + `claim` are public; `accept` needs a logged-in user
 * whose email matches the invite. The token is the random invite token (not a
 * UUID), so it's taken as a plain string param.
 */
@ApiTags('members')
@Controller({ path: 'invitations', version: '1' })
export class InvitationsController {
  constructor(private readonly invites: MemberInviteService) {}

  @Get(':token')
  @ApiErrorResponse({ status: 400, code: 'INVITE_INVALID' })
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post(':token/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 400, code: 'INVITE_INVALID' })
  @ApiErrorResponse({ status: 403, code: 'INVITE_EMAIL_MISMATCH' })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invites.accept(token, user);
  }

  @Post(':token/claim')
  @ApiErrorResponse({ status: 400, code: 'INVITE_INVALID' })
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'EMAIL_TAKEN' })
  claim(
    @Param('token') token: string,
    @Body() dto: ClaimInviteDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.invites.claim(token, dto, { ip, userAgent });
  }
}
