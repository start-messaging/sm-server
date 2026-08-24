import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import {
  CreateAutoReplyRuleDto,
  UpdateAutoReplyRuleDto,
} from './dto/auto-reply-rule.dto';
import { WhatsappAutoRepliesService } from './whatsapp-auto-replies.service';

@ApiTags('auto-reply-rules')
@Controller({
  path: 'workspaces/:slug/whatsapp/auto-reply-rules',
  version: '1',
})
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)
@RequiresFeature(PLAN_FEATURE_KEYS.keywordAutoreplies)
@ApiBearerAuth()
export class WhatsappAutoRepliesController {
  constructor(private readonly service: WhatsappAutoRepliesService) {}

  @Get()
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({ summary: 'List keyword auto-reply rules' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.service.list(ctx.workspace.id);
  }

  @Post()
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create keyword auto-reply rule' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateAutoReplyRuleDto,
  ) {
    return this.service.create(ctx.workspace.id, dto);
  }

  @Patch(':id')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update keyword auto-reply rule' })
  update(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: UpdateAutoReplyRuleDto,
  ) {
    return this.service.update(ctx.workspace.id, id, dto);
  }

  @Delete(':id')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Delete keyword auto-reply rule' })
  delete(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.service.delete(ctx.workspace.id, id);
  }
}
