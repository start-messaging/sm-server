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
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappCampaignsService } from '../services/whatsapp-campaigns.service';
import { WhatsappConnectService } from '../services/whatsapp-connect.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';

@ApiTags('whatsapp-campaigns')
@Controller({ path: 'workspaces/:slug/whatsapp/campaigns', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappCampaignsController {
  constructor(
    private readonly campaignsService: WhatsappCampaignsService,
    private readonly connectService: WhatsappConnectService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.list(ctx.workspace.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get campaign by ID' })
  getById(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.getById(ctx.workspace.id, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create campaign' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.campaignsService.create(ctx.workspace.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update campaign' })
  update(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.campaignsService.update(ctx.workspace.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete campaign' })
  delete(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.delete(ctx.workspace.id, id);
  }

  @Post(':id/launch')
  @ApiOperation({ summary: 'Launch campaign' })
  async launch(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const planFeatures = ctx.workspace.plan?.features;
    const connStatus = await this.connectService.getStatus(ctx.workspace.id);
    return this.campaignsService.launch(ctx.workspace.id, id, {
      planFeatures,
      metaPaymentReady: connStatus.metaPaymentReady,
    });
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause campaign' })
  pause(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.pause(ctx.workspace.id, id);
  }

  @Post(':id/resume')
  @ApiOperation({ summary: 'Resume paused campaign' })
  resume(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.resume(ctx.workspace.id, id);
  }
}
