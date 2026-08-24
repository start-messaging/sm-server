import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import { WhatsappAnalyticsService } from '../services/whatsapp-analytics.service';

@ApiTags('whatsapp-analytics')
@Controller({ path: 'workspaces/:slug/whatsapp/analytics', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)
@ApiBearerAuth()
export class WhatsappAnalyticsController {
  constructor(private readonly analyticsService: WhatsappAnalyticsService) {}

  @Get('overview')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'Get dashboard analytics overview' })
  getOverview(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.analyticsService.overview(ctx.workspace.id);
  }
}
