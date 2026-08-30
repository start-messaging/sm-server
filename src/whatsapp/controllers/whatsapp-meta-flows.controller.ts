import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { WhatsappMetaFlowsService } from '../services/whatsapp-meta-flows.service';

@ApiTags('whatsapp-meta-flows')
@Controller({ path: 'workspaces/:slug/whatsapp/meta-flows', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappMetaFlowsController {
  constructor(private readonly service: WhatsappMetaFlowsService) {}

  @Get()
  list(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.service.list(ctx.workspace.id);
  }

  @Post('sync')
  @MinRole(WorkspaceRole.AGENT)
  sync(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.service.sync(ctx.workspace.id);
  }
}
