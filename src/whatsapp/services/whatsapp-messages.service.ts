import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import { AppException } from '../../common/exceptions/app.exception';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaContact, type ContactSource } from '../entities/wa-contact.entity';
import { WaAssignmentEvent } from '../entities/wa-assignment-event.entity';
import { User } from '../../users/entities/user.entity';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import { normalizeWaE164 } from '../../common/phone/normalize-wa-e164';
import {
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../../workspaces/entities/workspace-member.entity';

export type ConversationTab = 'all' | 'active' | 'mine';

@Injectable()
export class WhatsappMessagesService {
  constructor(
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaAssignmentEvent)
    private readonly assignmentEvents: Repository<WaAssignmentEvent>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {}

  async createOrGetConversation(
    workspaceId: string,
    contactPhone: string,
    contactName?: string,
  ): Promise<WaConversation> {
    const { e164 } = parseMobileOrThrow(contactPhone);

    const contact = await this.upsertContact(
      workspaceId,
      e164,
      contactName ?? null,
      'manual',
    );

    const existing = await this.findConversationByPhone(workspaceId, e164);
    if (existing) {
      if (contactName && !existing.contactName) {
        existing.contactName = contactName;
      }
      if (!existing.contactId) {
        existing.contactId = contact.id;
      }
      if (existing.contactPhone !== e164) {
        existing.contactPhone = e164;
      }
      await this.conversations.save(existing);
      return existing;
    }

    const conversation = this.conversations.create({
      workspaceId,
      contactPhone: e164,
      contactName: contactName ?? null,
      contactId: contact.id,
      unreadCount: 0,
      lastMessageBody: null,
      lastMessageAt: null,
      lastInboundAt: null,
      status: 'open',
    });
    return this.conversations.save(conversation);
  }

  async listConversations(
    workspaceId: string,
    membership: WorkspaceMember,
    tab: ConversationTab = 'all',
  ) {
    const isAgent =
      ROLE_RANK[membership.role] <= ROLE_RANK[WorkspaceRole.AGENT];
    const qb = this.conversations
      .createQueryBuilder('c')
      .leftJoin(User, 'u', 'u.id = c.assigned_to_user_id')
      .addSelect('u.full_name', 'assigneeName')
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.deleted_at IS NULL');

    if (isAgent) {
      switch (tab) {
        case 'mine':
          qb.andWhere('c.assigned_to_user_id = :userId', {
            userId: membership.userId,
          });
          break;
        case 'all':
        case 'active':
        default:
          qb.andWhere(
            '(c.assigned_to_user_id = :userId OR (c.assigned_to_user_id IS NULL AND c.status = :open))',
            { userId: membership.userId, open: 'open' },
          );
          if (tab === 'active') {
            qb.andWhere('c.status = :open', { open: 'open' });
          }
          break;
      }
    } else {
      switch (tab) {
        case 'mine':
          qb.andWhere('c.assigned_to_user_id = :userId', {
            userId: membership.userId,
          });
          break;
        case 'active':
          qb.andWhere('c.status = :open', { open: 'open' });
          break;
        case 'all':
        default:
          break;
      }
    }

    qb.orderBy('c.last_message_at', 'DESC', 'NULLS LAST');

    const raw = await qb.getRawAndEntities();

    for (const c of raw.entities) {
      if (!c.contactId) {
        try {
          await this.ensureContactLinked(c);
        } catch {
          // Leave unlinked — rail shows empty rather than failing the list.
        }
      }
    }

    const conversations = raw.entities.map((c, i) => ({
      id: c.id,
      contactName: c.contactName,
      contactPhone: c.contactPhone,
      contactId: c.contactId,
      assignedToUserId: c.assignedToUserId,
      assigneeName:
        (raw.raw[i] as { assigneeName?: string })?.assigneeName ?? null,
      status: c.status,
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

    return { conversations, total: conversations.length };
  }

  async listMessages(
    workspaceId: string,
    conversationId: string,
    membership: WorkspaceMember,
  ) {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId, workspaceId },
    });
    if (!conversation) {
      throw new AppException(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        404,
      );
    }

    const isAgent =
      ROLE_RANK[membership.role] <= ROLE_RANK[WorkspaceRole.AGENT];
    if (
      isAgent &&
      conversation.assignedToUserId !== null &&
      conversation.assignedToUserId !== membership.userId
    ) {
      throw new AppException(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        404,
      );
    }

    try {
      await this.ensureContactLinked(conversation);
    } catch {
      // Leave unlinked — rail shows empty rather than failing the thread.
    }

    const [rows, total] = await this.messages.findAndCount({
      where: { workspaceId, conversationId },
      order: { timestamp: 'ASC' },
    });

    if (conversation.unreadCount > 0) {
      conversation.unreadCount = 0;
      await this.conversations.save(conversation);
    }

    const messages = rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      status: m.status,
      body: m.body,
      timestamp: m.timestamp.toISOString(),
      templateName: m.templateName,
      failureCode: m.failureCode,
      failureReason: m.failureReason,
      mediaType: m.mediaType ?? null,
      mediaUrl: m.mediaUrl ?? null,
      mediaMime: m.mediaMime ?? null,
      mediaFilename: m.mediaFilename ?? null,
    }));

    return { messages, total };
  }

  async patchConversation(
    workspaceId: string,
    conversationId: string,
    membership: WorkspaceMember,
    dto: {
      assignedToUserId?: string | null;
      status?: 'open' | 'resolved';
      unreadCount?: number;
      claim?: boolean;
    },
  ) {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId, workspaceId },
    });
    if (!conversation) {
      throw new AppException(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        404,
      );
    }

    const isAgent =
      ROLE_RANK[membership.role] <= ROLE_RANK[WorkspaceRole.AGENT];
    const isManagerPlus =
      ROLE_RANK[membership.role] >= ROLE_RANK[WorkspaceRole.MANAGER];

    if (
      isAgent &&
      conversation.assignedToUserId !== null &&
      conversation.assignedToUserId !== membership.userId
    ) {
      throw new AppException(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        404,
      );
    }

    let sseReason: 'assignment' | 'resolved' | null = null;

    if (dto.unreadCount === 0) {
      conversation.unreadCount = 0;
    }

    if (dto.claim === true) {
      if (conversation.assignedToUserId !== null) {
        throw new AppException(
          {
            code: 'WORKSPACE_ROLE_FORBIDDEN',
            message: 'Conversation is already assigned',
          },
          403,
        );
      }
      const prev = conversation.assignedToUserId;
      conversation.assignedToUserId = membership.userId;
      await this.logAssignmentEvent(workspaceId, conversationId, {
        actorUserId: membership.userId,
        actorType: 'workspace_member',
        action: 'CLAIM',
        fromUserId: prev,
        toUserId: membership.userId,
      });
      await this.syncContactAssignee(conversation);
      sseReason = 'assignment';
    }

    if (dto.assignedToUserId !== undefined && dto.claim !== true) {
      if (!isManagerPlus) {
        throw new AppException(
          {
            code: 'WORKSPACE_ROLE_FORBIDDEN',
            message: 'Your role does not allow this action',
          },
          403,
        );
      }
      const prev = conversation.assignedToUserId;
      conversation.assignedToUserId = dto.assignedToUserId;
      // TAKEOVER: MANAGER+ assigns to self and a different user was previously assigned.
      const action =
        dto.assignedToUserId === null
          ? ('UNASSIGN' as const)
          : dto.assignedToUserId === membership.userId &&
              prev !== null &&
              prev !== membership.userId
            ? ('TAKEOVER' as const)
            : ('ASSIGN' as const);
      await this.logAssignmentEvent(workspaceId, conversationId, {
        actorUserId: membership.userId,
        actorType: 'workspace_member',
        action,
        fromUserId: prev,
        toUserId: dto.assignedToUserId,
      });
      await this.syncContactAssignee(conversation);
      sseReason = 'assignment';
    }

    if (dto.status === 'resolved') {
      const canResolve =
        isManagerPlus ||
        (isAgent && conversation.assignedToUserId === membership.userId);
      if (!canResolve) {
        throw new AppException(
          {
            code: 'WORKSPACE_ROLE_FORBIDDEN',
            message: 'Your role does not allow this action',
          },
          403,
        );
      }
      conversation.status = 'resolved';
      conversation.resolvedAt = new Date();
      conversation.resolvedByUserId = membership.userId;
      await this.logAssignmentEvent(workspaceId, conversationId, {
        actorUserId: membership.userId,
        actorType: 'workspace_member',
        action: 'RESOLVE',
        fromUserId: null,
        toUserId: null,
      });
      sseReason = 'resolved';
    } else if (dto.status === 'open') {
      conversation.status = 'open';
      conversation.resolvedAt = null;
      conversation.resolvedByUserId = null;
      await this.logAssignmentEvent(workspaceId, conversationId, {
        actorUserId: membership.userId,
        actorType: 'workspace_member',
        action: 'REOPEN',
        fromUserId: null,
        toUserId: null,
      });
      sseReason = 'assignment';
    }

    await this.conversations.save(conversation);

    if (sseReason) {
      await this.inboxRealtime.publishInboxUpdated(
        workspaceId,
        conversationId,
        sseReason,
      );
    }

    const assignee = conversation.assignedToUserId
      ? await this.users.findOne({
          where: { id: conversation.assignedToUserId },
          select: { fullName: true },
        })
      : null;

    return this.serializeConversation(conversation, assignee?.fullName ?? null);
  }

  /**
   * Older inbound rows stored Meta `from` without `+` and often left
   * `contactId` null. Upsert a CRM contact from the phone and attach it so
   * the inbox rail (tags, notes, stage) can render.
   */
  private async ensureContactLinked(
    conversation: WaConversation,
  ): Promise<WaConversation> {
    if (conversation.contactId) return conversation;

    let phoneE164: string;
    try {
      phoneE164 = normalizeWaE164(conversation.contactPhone);
    } catch {
      return conversation;
    }

    const contact = await this.upsertContact(
      conversation.workspaceId,
      phoneE164,
      conversation.contactName,
      'whatsapp',
    );

    conversation.contactId = contact.id;
    if (conversation.contactPhone !== phoneE164) {
      const clash = await this.conversations.findOne({
        where: {
          workspaceId: conversation.workspaceId,
          contactPhone: phoneE164,
        },
      });
      if (!clash || clash.id === conversation.id) {
        conversation.contactPhone = phoneE164;
      }
    }
    await this.conversations.save(conversation);
    return conversation;
  }

  private async findConversationByPhone(
    workspaceId: string,
    e164: string,
  ): Promise<WaConversation | null> {
    const byE164 = await this.conversations.findOne({
      where: { workspaceId, contactPhone: e164 },
    });
    if (byE164) return byE164;
    const digits = e164.replace(/^\+/, '');
    if (digits === e164) return null;
    return this.conversations.findOne({
      where: { workspaceId, contactPhone: digits },
    });
  }

  private async upsertContact(
    workspaceId: string,
    phoneE164: string,
    name: string | null,
    source: ContactSource,
  ): Promise<WaContact> {
    let contact = await this.contacts.findOne({
      where: { workspaceId, phoneE164 },
    });
    if (!contact) {
      const digits = phoneE164.replace(/^\+/, '');
      if (digits !== phoneE164) {
        contact = await this.contacts.findOne({
          where: { workspaceId, phoneE164: digits },
        });
        if (contact) {
          contact.phoneE164 = phoneE164;
          if (name && !contact.name) contact.name = name;
          await this.contacts.save(contact);
          return contact;
        }
      }
      contact = this.contacts.create({
        workspaceId,
        phoneE164,
        name,
        source,
        optedIn: true,
        tags: [],
        attributes: {},
      });
      await this.contacts.save(contact);
    } else if (name && !contact.name) {
      contact.name = name;
      await this.contacts.save(contact);
    }
    return contact;
  }

  private async logAssignmentEvent(
    workspaceId: string,
    conversationId: string,
    data: {
      actorUserId: string | null;
      actorType: 'workspace_member' | 'platform_staff';
      action:
        | 'ASSIGN'
        | 'CLAIM'
        | 'UNASSIGN'
        | 'TAKEOVER'
        | 'RESOLVE'
        | 'REOPEN';
      fromUserId: string | null;
      toUserId: string | null;
    },
  ): Promise<void> {
    const event = this.assignmentEvents.create({
      workspaceId,
      conversationId,
      ...data,
    });
    await this.assignmentEvents.save(event);
  }

  private async syncContactAssignee(
    conversation: WaConversation,
  ): Promise<void> {
    if (!conversation.contactId) return;
    await this.contacts.update(conversation.contactId, {
      assignedToUserId: conversation.assignedToUserId,
    });
  }

  private serializeConversation(
    c: WaConversation,
    assigneeName: string | null,
  ) {
    return {
      id: c.id,
      contactName: c.contactName,
      contactPhone: c.contactPhone,
      contactId: c.contactId,
      assignedToUserId: c.assignedToUserId,
      assigneeName,
      status: c.status,
      lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      lastMessage: c.lastMessageBody
        ? {
            id: c.id,
            body: c.lastMessageBody,
            timestamp: c.lastMessageAt?.toISOString(),
          }
        : null,
      unreadCount: c.unreadCount,
      resolvedAt: c.resolvedAt?.toISOString() ?? null,
      resolvedByUserId: c.resolvedByUserId,
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
