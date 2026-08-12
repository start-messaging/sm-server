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
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappContactsService } from '../services/whatsapp-contacts.service';
import { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';

@ApiTags('contacts')
@Controller({ path: 'workspaces/:slug/contacts', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappContactsController {
  constructor(private readonly contactsService: WhatsappContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List contacts' })
  list(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.contactsService.list(ctx.workspace.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create contact' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.create(ctx.workspace.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact' })
  update(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactsService.update(ctx.workspace.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete contact' })
  delete(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.contactsService.delete(ctx.workspace.id, id);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import contacts from CSV' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
  ) {
    const content = file.buffer.toString('utf-8');
    const lines = content.split('\n').filter((l: string) => l.trim());
    // Skip header row
    const dataLines = lines.slice(1);
    const rows = dataLines
      .map((line: string) => {
        const parts = line.split(',');
        return {
          phoneE164: (parts[0] ?? '').trim(),
          name: (parts[1] ?? '').trim() || undefined,
          email: (parts[2] ?? '').trim() || undefined,
          tags: (parts[3] ?? '').trim() || undefined,
        };
      })
      .filter((r: { phoneE164: string }) => r.phoneE164);

    return this.contactsService.importCsv(ctx.workspace.id, rows);
  }
}
