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
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { WhatsappQuickRepliesService } from '../services/whatsapp-quick-replies.service';
import {
  CreateQuickReplyDto,
  UpdateQuickReplyDto,
} from '../dto/quick-reply.dto';

@ApiTags('quick-replies')
@Controller({ path: 'workspaces/:slug/whatsapp/quick-replies', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappQuickRepliesController {
  constructor(private readonly service: WhatsappQuickRepliesService) {}

  @Get()
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({ summary: 'List quick replies' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.service.list(ctx.workspace.id);
  }

  @Post()
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Create quick reply' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateQuickReplyDto,
  ) {
    return this.service.create(ctx.workspace.id, dto);
  }

  @Patch(':id')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Update quick reply' })
  update(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: UpdateQuickReplyDto,
  ) {
    return this.service.update(ctx.workspace.id, id, dto);
  }

  @Delete(':id')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiOperation({ summary: 'Delete quick reply' })
  delete(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.service.delete(ctx.workspace.id, id);
  }
}
