import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { AppException } from '../../common/exceptions/app.exception';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { WhatsappContactsService } from '../services/whatsapp-contacts.service';
import { CreateContactDto, UpdateContactDto } from '../dto/contact.dto';
import { CreateContactNoteDto } from '../dto/contact-note.dto';
import { ImportContactsDto } from '../dto/import-contacts.dto';
import { ListContactsQueryDto } from '../dto/list-contacts-query.dto';

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
    @Query() query: ListContactsQueryDto,
  ) {
    return this.contactsService.list(ctx.workspace.id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create contact' })
  create(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactsService.create(
      ctx.workspace.id,
      dto,
      ctx.workspace.plan,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one contact' })
  getById(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.contactsService.getById(ctx.workspace.id, id);
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
  @ApiConsumes('multipart/form-data', 'application/json')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: ImportContactsDto,
  ) {
    if (file) {
      const content = file.buffer.toString('utf-8');
      const lines = content
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
      const dataLines = lines.slice(1);
      const rows = dataLines
        .map((line: string) => {
          const parts = parseCsvLine(line);
          return {
            phoneE164: (parts[0] ?? '').trim(),
            name: (parts[1] ?? '').trim() || undefined,
            email: (parts[2] ?? '').trim() || undefined,
            tags: (parts[3] ?? '').trim() || undefined,
          };
        })
        .filter((r: { phoneE164: string }) => r.phoneE164);

      return this.contactsService.importCsv(
        ctx.workspace.id,
        rows,
        ctx.workspace.plan,
      );
    }

    if (body.rows?.length) {
      return this.contactsService.importMapped(
        ctx.workspace.id,
        body.rows,
        body.mapping ?? {},
        ctx.workspace.plan,
      );
    }

    throw new AppException(
      { code: 'IMPORT_EMPTY', message: 'No file or rows provided' },
      400,
    );
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'List notes for a contact' })
  listNotes(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.contactsService.listNotes(ctx.workspace.id, id);
  }

  @Post(':id/notes')
  @MinRole(WorkspaceRole.AGENT)
  @ApiOperation({ summary: 'Add note to a contact' })
  createNote(
    @Param('slug') _slug: string,
    @Param('id') id: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateContactNoteDto,
  ) {
    return this.contactsService.createNote(
      ctx.workspace.id,
      id,
      dto.body,
      ctx.membership.userId,
    );
  }
}

/** RFC 4180-compliant CSV line splitter — handles double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}
