import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import {
  ApiKeyDto,
  CreateApiKeyResult,
  WhatsappApiKeysService,
} from '../services/whatsapp-api-keys.service';

export class CreateApiKeyDto {
  /** Human label so a customer can tell their keys apart, e.g. "Shopify". */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

/**
 * API-key management for the Settings UI (JWT-authenticated).
 *
 * Listing is ungated on purpose: a workspace that downgrades must still be
 * able to see and revoke the keys it already issued. Only minting a new key
 * needs the plan feature.
 */
@ApiTags('whatsapp-api-keys')
@Controller({ path: 'workspaces/:slug/api-keys', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)
@ApiBearerAuth()
export class WhatsappApiKeysController {
  constructor(private readonly service: WhatsappApiKeysService) {}

  @Get()
  @MinRole(WorkspaceRole.MANAGER)
  @ApiOperation({ summary: 'List API keys' })
  async list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ): Promise<{ apiKeys: ApiKeyDto[] }> {
    const keys = await this.service.list(ctx.workspace.id);
    return { apiKeys: keys.map((k) => WhatsappApiKeysService.serialize(k)) };
  }

  @Post()
  @MinRole(WorkspaceRole.MANAGER)
  @RequiresFeature(PLAN_FEATURE_KEYS.apiTriggers)
  @ApiOperation({
    summary: 'Create an API key — the raw key is returned only once',
  })
  async create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateApiKeyDto,
  ): Promise<CreateApiKeyResult> {
    const { key, rawKey } = await this.service.create(
      ctx.workspace.id,
      dto.name,
    );
    return WhatsappApiKeysService.serializeWithRaw(key, rawKey);
  }

  @Delete(':id')
  @MinRole(WorkspaceRole.MANAGER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke an API key' })
  revoke(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ): Promise<void> {
    return this.service.revoke(ctx.workspace.id, id);
  }
}
