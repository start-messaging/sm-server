import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentWorkspace } from '../../workspaces/decorators/current-workspace.decorator';
import { WorkspaceMemberGuard } from '../../workspaces/guards/workspace-member.guard';
import type { WorkspaceContext } from '../../workspaces/guards/workspace-member.guard';
import { WhatsappMessagesService } from '../services/whatsapp-messages.service';
import {
  WhatsappSendService,
  SendMessageInput,
} from '../services/whatsapp-send.service';
import { SendMessageDto } from '../dto/send-message.dto';
import { CreateConversationDto } from '../dto/create-conversation.dto';

@ApiTags('whatsapp-messages')
@Controller({ path: 'workspaces/:slug/whatsapp/conversations', version: '1' })
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@ApiBearerAuth()
export class WhatsappMessagesController {
  constructor(
    private readonly messagesService: WhatsappMessagesService,
    private readonly sendService: WhatsappSendService,
  ) {}

  @Post()
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
  @ApiOperation({ summary: 'List conversations (inbox)' })
  listConversations(
    @Param('slug') _slug: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.messagesService.listConversations(ctx.workspace.id);
  }

  @Get(':conversationId/messages')
  @ApiOperation({ summary: 'List messages in a conversation' })
  listMessages(
    @Param('slug') _slug: string,
    @Param('conversationId') conversationId: string,
    @CurrentWorkspace() ctx: WorkspaceContext,
  ) {
    return this.messagesService.listMessages(ctx.workspace.id, conversationId);
  }

  @Post(':conversationId/messages')
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
    );
  }
}
