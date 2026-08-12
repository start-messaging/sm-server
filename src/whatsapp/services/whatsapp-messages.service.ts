import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';

@Injectable()
export class WhatsappMessagesService {
  constructor(
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
  ) {}

  /**
   * Find an existing conversation by normalized phone or create a new one.
   * Used by the client to start outbound before first inbound (App Review flow).
   */
  async createOrGetConversation(
    workspaceId: string,
    contactPhone: string,
    contactName?: string,
  ): Promise<WaConversation> {
    const { e164 } = parseMobileOrThrow(contactPhone);

    const existing = await this.conversations.findOne({
      where: { workspaceId, contactPhone: e164 },
    });
    if (existing) {
      if (contactName && !existing.contactName) {
        existing.contactName = contactName;
        await this.conversations.save(existing);
      }
      return existing;
    }

    const conversation = this.conversations.create({
      workspaceId,
      contactPhone: e164,
      contactName: contactName ?? null,
      unreadCount: 0,
      lastMessageBody: null,
      lastMessageAt: null,
      lastInboundAt: null,
    });
    return this.conversations.save(conversation);
  }

  async listConversations(workspaceId: string) {
    const [rows, total] = await this.conversations.findAndCount({
      where: { workspaceId },
      order: { lastMessageAt: 'DESC' },
    });

    const conversations = rows.map((c) => ({
      id: c.id,
      contactName: c.contactName,
      contactPhone: c.contactPhone,
      lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      lastMessage: c.lastMessageBody
        ? {
            id: c.id,
            body: c.lastMessageBody,
            timestamp: c.lastMessageAt?.toISOString(),
          }
        : null,
      unreadCount: c.unreadCount,
      updatedAt: c.updatedAt.toISOString(),
    }));

    return { conversations, total };
  }

  async listMessages(workspaceId: string, conversationId: string) {
    const [rows, total] = await this.messages.findAndCount({
      where: { workspaceId, conversationId },
      order: { timestamp: 'ASC' },
    });

    const messages = rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      status: m.status,
      body: m.body,
      timestamp: m.timestamp.toISOString(),
      templateName: m.templateName,
    }));

    return { messages, total };
  }
}
