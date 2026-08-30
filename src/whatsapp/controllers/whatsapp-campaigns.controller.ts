import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import { WhatsappCampaignsService } from '../services/whatsapp-campaigns.service';
import { WhatsappConnectService } from '../services/whatsapp-connect.service';
import { WhatsappTemplatesService } from '../services/whatsapp-templates.service';
import { CreateCampaignDto, UpdateCampaignDto } from '../dto/campaign.dto';
import { CampaignAudienceCsvDto } from '../dto/campaign-audience-csv.dto';

@ApiTags('whatsapp-campaigns')
@Controller({ path: 'workspaces/:slug/whatsapp/campaigns', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)
@ApiBearerAuth()
export class WhatsappCampaignsController {
  constructor(
    private readonly campaignsService: WhatsappCampaignsService,
    private readonly connectService: WhatsappConnectService,
    private readonly templatesService: WhatsappTemplatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List campaigns' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.list(ctx.workspace.id);
  }

  @Get('last-marketing-send')
  @ApiOperation({ summary: 'Get last marketing campaign send timestamp' })
  getLastMarketingSend(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.getLastMarketingSend(ctx.workspace.id);
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
  @ApiOperation({ summary: 'Create campaign. Accepts JSON or multipart/form-data with optional headerFile for media-header templates.' })
  @UseInterceptors(FileInterceptor('headerFile', { storage: memoryStorage(), limits: { fileSize: 16 * 1024 * 1024 } }))
  async create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateCampaignDto,
    @UploadedFile() headerFile?: Express.Multer.File,
  ) {
    let headerMediaUrl = dto.headerMediaUrl ?? undefined;
    if (headerFile?.buffer?.length) {
      const { url } = await this.templatesService.uploadMediaSample(
        ctx.workspace.id,
        headerFile.buffer,
        headerFile.mimetype,
        headerFile.originalname ?? 'header',
      );
      headerMediaUrl = url;
    }
    // When sent as multipart, array/object fields arrive JSON-stringified.
    const audienceIds: string[] =
      typeof dto.audienceIds === 'string'
        ? (JSON.parse(dto.audienceIds as unknown as string) as string[])
        : (dto.audienceIds ?? []);
    const variableMapping: Record<string, string> | undefined =
      typeof dto.variableMapping === 'string'
        ? (JSON.parse(dto.variableMapping as unknown as string) as Record<string, string>)
        : dto.variableMapping;
    return this.campaignsService.create(ctx.workspace.id, {
      ...dto,
      audienceIds,
      variableMapping,
      headerMediaUrl,
    });
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicate campaign' })
  duplicate(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.duplicate(ctx.workspace.id, id);
  }

  @Get(':id/analytics')
  @RequiresFeature(PLAN_FEATURE_KEYS.campaignAnalytics)
  @ApiOperation({ summary: 'Get campaign analytics' })
  analytics(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.campaignsService.analytics(ctx.workspace.id, id);
  }

  @Post(':id/audience-csv')
  @ApiOperation({ summary: 'Upload a CSV audience for a campaign' })
  uploadAudienceCsv(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CampaignAudienceCsvDto,
  ) {
    return this.campaignsService.setAudienceCsv(ctx.workspace.id, id, dto.rows);
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
  @RequiresFeature(PLAN_FEATURE_KEYS.waCampaigns)
  @ApiOperation({ summary: 'Launch campaign' })
  async launch(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    const connStatus = await this.connectService.getStatus(ctx.workspace.id);
    return this.campaignsService.launch(ctx.workspace.id, id, {
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
