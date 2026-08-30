import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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

  @Get('agents')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'Per-agent performance stats for a date range' })
  getAgentStats(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 7 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();
    return this.analyticsService.getAgentStats(
      ctx.workspace.id,
      fromDate,
      toDate,
    );
  }

  @Get('message-errors')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'Failed message error report for a date range' })
  getMessageErrors(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 7 * 86_400_000);
    const toDate = to ? new Date(to) : new Date();
    return this.analyticsService.getMessageErrors(
      ctx.workspace.id,
      fromDate,
      toDate,
    );
  }
}
