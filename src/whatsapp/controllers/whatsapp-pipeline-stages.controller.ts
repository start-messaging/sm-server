import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappPipelineStagesService } from '../services/whatsapp-pipeline-stages.service';

@ApiTags('pipeline-stages')
@Controller({ path: 'workspaces/:slug/whatsapp/pipeline-stages', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappPipelineStagesController {
  constructor(private readonly service: WhatsappPipelineStagesService) {}

  @Get()
  @ApiOperation({ summary: 'List pipeline stages' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.service.list(ctx.workspace.id);
  }
}
