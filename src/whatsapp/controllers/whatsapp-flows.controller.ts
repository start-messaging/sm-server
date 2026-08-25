import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { CreateFlowDto, PatchFlowDto } from '../dto/flow.dto';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import { WhatsappFlowsService } from '../services/whatsapp-flows.service';

@ApiTags('flows')
@Controller({ path: 'workspaces/:slug/flows', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappFlowsController {
  constructor(private readonly service: WhatsappFlowsService) {}

  @Get()
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({ summary: 'List chatbot flows' })
  async list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const flows = await this.service.list(ctx.workspace.id);
    return { flows: flows.map((f) => WhatsappFlowsService.serialize(f)) };
  }

  @Post()
  @MinRole(WorkspaceRole.MANAGER)
  @ApiOperation({ summary: 'Create chatbot flow' })
  async create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateFlowDto,
  ) {
    const flow = await this.service.create(ctx.workspace.id, dto);
    return WhatsappFlowsService.serialize(flow);
  }

  @Get(':id')
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({ summary: 'Get chatbot flow by ID' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const flow = await this.service.findOne(ctx.workspace.id, id);
    return WhatsappFlowsService.serialize(flow);
  }

  @Patch(':id')
  @MinRole(WorkspaceRole.MANAGER)
  @ApiOperation({ summary: 'Update chatbot flow' })
  async update(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: PatchFlowDto,
  ) {
    const flow = await this.service.update(ctx.workspace.id, id, dto);
    return WhatsappFlowsService.serialize(flow);
  }

  @Delete(':id')
  @MinRole(WorkspaceRole.MANAGER)
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete chatbot flow' })
  remove(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ): Promise<void> {
    return this.service.remove(ctx.workspace.id, id);
  }

  @Post(':id/activate')
  @MinRole(WorkspaceRole.MANAGER)
  @UseGuards(RequiresFeatureGuard)
  @RequiresFeature(PLAN_FEATURE_KEYS.chatbotFlows)
  @ApiOperation({ summary: 'Activate chatbot flow' })
  async activate(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const flow = await this.service.activate(ctx.workspace.id, id);
    return WhatsappFlowsService.serialize(flow);
  }

  /** No plan gate: a downgraded workspace must always be able to switch a bot off. */
  @Post(':id/deactivate')
  @MinRole(WorkspaceRole.MANAGER)
  @ApiOperation({ summary: 'Deactivate chatbot flow' })
  async deactivate(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const flow = await this.service.deactivate(ctx.workspace.id, id);
    return WhatsappFlowsService.serialize(flow);
  }
}
