import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ApiErrorResponse } from '../../common/swagger/api-error-response.decorator';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { ConnectWhatsappDto } from '../dto/connect-whatsapp.dto';
import { RegisterPhoneDto } from '../dto/register-phone.dto';
import { WhatsappConnectService } from '../services/whatsapp-connect.service';

@ApiTags('whatsapp')
@UseInterceptors(ClassSerializerInterceptor)
@Controller({ path: 'workspaces/:slug/whatsapp', version: '1' })
export class WhatsappConnectController {
  constructor(private readonly connect: WhatsappConnectService) {}

  /**
   * Initiate WhatsApp Embedded Signup v4 connect.
   *
   * After success the client must show the Meta payment-method education
   * checklist (WA_ERR.META_PAYMENT_REQUIRED gate on sends).
   */
  @Post('connect')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Connect WABA via Embedded Signup v4' })
  @ApiErrorResponse({ status: 409, code: 'WABA_NOT_CONNECTED' })
  @ApiErrorResponse({ status: 502, code: 'WABA_CONNECT_FAILED' })
  connectWaba(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: ConnectWhatsappDto,
  ) {
    return this.connect.connect({
      code: dto.code,
      wabaId: dto.wabaId,
      phoneNumberId: dto.phoneNumberId,
      pin: dto.pin,
      workspaceId: ctx.workspace.id,
    });
  }

  /** Get current WhatsApp connection status for this workspace. */
  @Get('status')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  getStatus(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.connect.getStatus(ctx.workspace.id);
  }

  /**
   * Pull connection state from Meta Graph (manual refresh).
   * Use when a webhook may have been missed after deleting a phone/WABA in Meta.
   */
  @Post('sync')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync WhatsApp connection status from Meta' })
  syncFromMeta(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.connect.syncFromMeta(ctx.workspace.id);
  }

  @Post('register-phone')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Register PENDING phone with Cloud API (6-digit PIN)',
  })
  @ApiErrorResponse({ status: 404, code: 'WABA_NOT_CONNECTED' })
  @ApiErrorResponse({ status: 502, code: 'WABA_PHONE_REGISTER_FAILED' })
  registerPhone(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: RegisterPhoneDto,
  ) {
    return this.connect.registerPhone(ctx.workspace.id, dto.pin);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-disconnect WABA (re-onboard friendly)' })
  @ApiErrorResponse({ status: 404, code: 'WABA_NOT_CONNECTED' })
  disconnect(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.connect.disconnect(ctx.workspace.id);
  }
}
