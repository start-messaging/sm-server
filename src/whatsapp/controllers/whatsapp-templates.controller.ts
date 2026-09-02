import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app.exception';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappTemplatesService } from '../services/whatsapp-templates.service';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { WaTemplateDto, WaTemplateListDto } from '../dto/wa-template.dto';

@ApiTags('whatsapp-templates')
@Controller({ path: 'workspaces/:slug/whatsapp/templates', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappTemplatesController {
  constructor(private readonly templatesService: WhatsappTemplatesService) {}

  @Post('media-sample')
  @ApiOperation({ summary: 'Upload header media to R2; returns a public URL for use in campaigns/inbox sends' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 16 * 1024 * 1024 },
    }),
  )
  async uploadMediaSample(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new AppException(
        { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        400,
      );
    }
    return this.templatesService.uploadMediaSample(
      ctx.workspace.id,
      file.buffer,
      file.mimetype,
      file.originalname ?? 'upload',
    );
  }

  @Post('media-upload')
  @ApiOperation({
    summary: 'Upload template header media via Meta Resumable Upload API',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async uploadTemplateMedia(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.buffer?.length) {
      throw new AppException(
        { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        400,
      );
    }
    return this.templatesService.uploadTemplateMedia(
      ctx.workspace.id,
      file.buffer,
      file.mimetype,
      file.size,
      file.originalname ?? 'sample',
    );
  }

  @Get()
  @ApiOperation({ summary: 'List templates' })
  @ApiOkResponse({ type: WaTemplateListDto })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.templatesService.list(ctx.workspace.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create template on Meta',
    description:
      'Submits the template to Meta for review. The response always has status PENDING — Meta approves asynchronously, so a created template is not yet sendable.',
  })
  @ApiCreatedResponse({ type: WaTemplateDto })
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
  @ApiOkResponse({ type: WaTemplateListDto })
  sync(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.templatesService.sync(ctx.workspace.id);
  }
}
