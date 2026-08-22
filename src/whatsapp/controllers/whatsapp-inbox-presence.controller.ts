import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappInboxPresenceService } from '../services/whatsapp-inbox-presence.service';

@ApiTags('whatsapp-messages')
@Controller({ path: 'workspaces/:slug/whatsapp/conversations', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappInboxPresenceController {
  constructor(private readonly presenceService: WhatsappInboxPresenceService) {}

  /**
   * Heartbeat — call every ~20 s while the thread is mounted.
   * Records the caller as viewing; Redis key TTL is 45 s.
   * AGENT role: only allowed on own assigned conversation (mirrors message ACL).
   */
  @Post(':conversationId/presence')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Heartbeat: record current user as viewing a conversation',
  })
  async heartbeat(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ): Promise<void> {
    await this.presenceService.heartbeat(
      ctx.workspace.id,
      conversationId,
      ctx.membership,
    );
  }

  /**
   * Returns all users whose 45 s heartbeat TTL has not expired.
   * Returns `{ viewers: [] }` if Redis is down (fail-soft).
   */
  @Get(':conversationId/presence')
  @ApiOperation({ summary: 'Get active viewers for a conversation' })
  getViewers(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.presenceService.getViewers(
      ctx.workspace.id,
      conversationId,
      ctx.membership,
    );
  }
}
