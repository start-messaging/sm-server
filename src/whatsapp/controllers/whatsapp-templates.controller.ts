import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappTemplatesService } from '../services/whatsapp-templates.service';
import { CreateTemplateDto } from '../dto/create-template.dto';

@ApiTags('whatsapp-templates')
@Controller({ path: 'workspaces/:slug/whatsapp/templates', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappTemplatesController {
  constructor(private readonly templatesService: WhatsappTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'List templates' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.templatesService.list(ctx.workspace.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create template on Meta' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.templatesService.create(ctx.workspace.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete template' })
  delete(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.templatesService.delete(ctx.workspace.id, id);
  }

  @Post('sync')
  @ApiOperation({ summary: 'Sync templates from Meta' })
  sync(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.templatesService.sync(ctx.workspace.id);
  }
}
