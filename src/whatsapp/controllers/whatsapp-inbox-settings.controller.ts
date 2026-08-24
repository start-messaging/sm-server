import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { WhatsappInboxSettingsService } from '../services/whatsapp-inbox-settings.service';
import { PatchInboxSettingsDto } from '../dto/inbox-settings.dto';

@ApiTags('inbox-settings')
@Controller({ path: 'workspaces/:slug/whatsapp/inbox-settings', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappInboxSettingsController {
  constructor(private readonly service: WhatsappInboxSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get inbox settings (includes caller inboxAvailable)',
  })
  get(@Param('slug') _slug: string, @CurrentWorkspace() ctx: WorkspaceContext) {
    return this.service.get(ctx.workspace.id, ctx.membership.userId);
  }

  @Patch()
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({
    summary:
      'Update inbox settings. roundRobinEnabled and autoReplyDelaySeconds require ADMIN+; inboxAvailable is self-serve for AGENT+.',
  })
  patch(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: PatchInboxSettingsDto,
  ) {
    return this.service.patch(ctx.workspace.id, ctx.membership, dto);
  }
}
