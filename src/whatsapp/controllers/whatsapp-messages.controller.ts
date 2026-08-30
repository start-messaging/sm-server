import {
  Body,
  Controller,
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
import { memoryStorage } from 'multer';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AppException } from '../../common/exceptions/app.exception';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../../workspaces/decorators/min-role.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { RequiresFeature } from '../guards/requires-feature.decorator';
import { RequiresFeatureGuard } from '../guards/requires-feature.guard';
import {
  WhatsappMessagesService,
  ConversationTab,
  ConversationFilters,
} from '../services/whatsapp-messages.service';
import {
  WhatsappSendService,
  SendMessageInput,
} from '../services/whatsapp-send.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { SendInteractiveDto } from '../dto/send-interactive.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';
import { PatchConversationDto } from '../dto/patch-conversation.dto';
import { WA_ERR } from '../whatsapp-error-codes';

/** 100 MB absolute upload cap on our side (Meta per-type limits enforced in service). */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

@ApiTags('whatsapp-messages')
@Controller({ path: 'workspaces/:slug/whatsapp/conversations', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard, RequiresFeatureGuard)
@ApiBearerAuth()
export class WhatsappMessagesController {
  constructor(
    private readonly messagesService: WhatsappMessagesService,
    private readonly sendService: WhatsappSendService,
  ) {}

  @Post()
  @MinRole(WorkspaceRole.AGENT)
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'Create or get conversation by phone number' })
  createOrGetConversation(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: CreateConversationDto,
  ) {
    return this.messagesService.createOrGetConversation(
      ctx.workspace.id,
      dto.contactPhone,
      dto.contactName,
    );
  }

  @Get()
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'List conversations (inbox)' })
  listConversations(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query('tab') tab?: string,
    @Query('unread') unread?: string,
    @Query('assigneeUserId') assigneeUserId?: string,
    @Query('window') window?: string,
    @Query('tag') tag?: string,
  ) {
    const validTab: ConversationTab =
      tab === 'all' || tab === 'active' || tab === 'mine' ? tab : 'all';
    const filters: ConversationFilters = {
      unread: unread === 'true' ? true : undefined,
      assigneeUserId: assigneeUserId || undefined,
      window:
        window === 'open' ? 'open' : window === 'closed' ? 'closed' : undefined,
      tag: tag || undefined,
    };
    return this.messagesService.listConversations(
      ctx.workspace.id,
      ctx.membership,
      validTab,
      filters,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count conversations with unread messages' })
  getUnreadCount(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.messagesService.getUnreadCount(ctx.workspace.id);
  }

  @Get(':conversationId/assignment-events')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({
    summary: 'List assignment events for a conversation (oldest → newest)',
  })
  listAssignmentEvents(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.messagesService.listAssignmentEvents(
      ctx.workspace.id,
      conversationId,
      ctx.membership,
    );
  }

  @Get(':conversationId/messages')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'List messages in a conversation' })
  listMessages(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.messagesService.listMessages(
      ctx.workspace.id,
      conversationId,
      ctx.membership,
    );
  }

  @Post(':conversationId/messages')
  @MinRole(WorkspaceRole.AGENT)
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({ summary: 'Send a message (text or template)' })
  sendMessage(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: SendMessageDto,
  ) {
    return this.sendService.send(
      ctx.workspace.id,
      conversationId,
      dto as SendMessageInput,
      { bypassOptOutGate: true, senderId: ctx.membership.userId },
    );
  }

  @Post(':conversationId/media')
  @MinRole(WorkspaceRole.AGENT)
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({
    summary:
      'Upload and send a media message (image / audio / video / document)',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  sendMedia(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('caption') caption?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new AppException(
        { code: 'VALIDATION_ERROR', message: 'No file uploaded' },
        400,
      );
    }
    const mimeType = file.mimetype ?? 'application/octet-stream';
    const mediaType = resolveMediaTypeFromMime(mimeType);
    if (!isAllowedOutboundMediaType(mediaType)) {
      throw new AppException(
        {
          code: WA_ERR.MEDIA_TYPE_UNSUPPORTED,
          message: `Unsupported media type: ${mimeType}. Send image, audio, video, or document.`,
        },
        400,
      );
    }
    return this.sendService.send(
      ctx.workspace.id,
      conversationId,
      {
        type: mediaType,
        buffer: file.buffer,
        mimeType,
        filename: file.originalname ?? 'upload',
        caption: caption?.trim() || undefined,
      } satisfies SendMessageInput,
      { bypassOptOutGate: true },
    );
  }

  @Post(':conversationId/interactive')
  @MinRole(WorkspaceRole.AGENT)
  @RequiresFeature(PLAN_FEATURE_KEYS.interactiveMessages)
  @ApiOperation({ summary: 'Send an interactive (button or list) message' })
  sendInteractive(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: SendInteractiveDto,
  ) {
    return this.sendService.sendInteractive(
      ctx.workspace.id,
      conversationId,
      dto,
      ctx.membership.userId,
    );
  }

  @Patch(':conversationId')
  @RequiresFeature(PLAN_FEATURE_KEYS.agentInbox)
  @ApiOperation({
    summary: 'Patch conversation (assign/claim/resolve/mark-read)',
  })
  patchConversation(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Body() dto: PatchConversationDto,
  ) {
    return this.messagesService.patchConversation(
      ctx.workspace.id,
      conversationId,
      ctx.membership,
      dto,
    );
  }
}

function resolveMediaTypeFromMime(
  mime: string,
): 'image' | 'audio' | 'video' | 'document' | 'sticker' {
  const lower = mime.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('audio/')) return 'audio';
  if (lower.startsWith('video/')) return 'video';
  return 'document';
}

function isAllowedOutboundMediaType(
  t: string,
): t is 'image' | 'audio' | 'video' | 'document' {
  return t === 'image' || t === 'audio' || t === 'video' || t === 'document';
}
