import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { paginate, type Paginated } from '../../common/types/pagination';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaAssignmentEvent } from '../entities/wa-assignment-event.entity';
import { WaContact } from '../entities/wa-contact.entity';
import {
  MemberStatus,
  WorkspaceMember,
} from '../../workspaces/entities/workspace-member.entity';
import { User } from '../../users/entities/user.entity';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import type { AdminListConversationsQueryDto } from '../dto/admin-list-conversations-query.dto';
import type { AdminForceAssignDto } from '../dto/admin-force-assign.dto';

export interface AdminConversationRow {
  id: string;
  workspaceId: string;
  contactPhone: string;
  contactName: string | null;
  contactId: string | null;
  assignedToUserId: string | null;
  assigneeName: string | null;
  status: string;
  unreadCount: number;
  lastMessageBody: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  createdAt: string;
}

export interface AdminMessageRow {
  id: string;
  conversationId: string;
  direction: string;
  status: string;
  body: string | null;
  timestamp: string;
  templateName: string | null;
  metaMessageId: string | null;
  failureCode: number | null;
  failureReason: string | null;
}

export interface AdminAssignmentEventRow {
  id: string;
  conversationId: string;
  actorUserId: string | null;
  actorType: string;
  action: string;
  fromUserId: string | null;
  toUserId: string | null;
  createdAt: string;
}

export interface AdminMemberLoadRow {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  openChats: number;
}

@Injectable()
export class AdminInboxOpsService {
  constructor(
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectRepository(WaAssignmentEvent)
    private readonly assignmentEvents: Repository<WaAssignmentEvent>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly realtime: InboxRealtimeService,
  ) {}

  async listConversations(
    workspaceId: string,
    query: AdminListConversationsQueryDto,
  ): Promise<Paginated<AdminConversationRow>> {
    const where: Record<string, unknown> = { workspaceId };
    if (query.status === 'open' || query.status === 'resolved') {
      where['status'] = query.status;
    }
    if (query.assignedTo === 'unassigned') {
      where['assignedToUserId'] = IsNull();
    } else if (query.assignedTo) {
      where['assignedToUserId'] = query.assignedTo;
    }

    const [rows, total] = await this.conversations.findAndCount({
      where,
      order: { lastMessageAt: 'DESC' },
      skip: query.skip,
      take: query.take,
    });

    if (rows.length === 0) return paginate([], total, query);

    // Resolve assignee names in one query.
    const assigneeIds = [
      ...new Set(rows.map((r) => r.assignedToUserId).filter(Boolean)),
    ] as string[];

    const assigneeMap = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const userRows = await this.users.findByIds(assigneeIds);
      for (const u of userRows) {
        assigneeMap.set(u.id, u.fullName ?? u.email);
      }
    }

    const items: AdminConversationRow[] = rows.map((c) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      contactPhone: c.contactPhone,
      contactName: c.contactName,
      contactId: c.contactId,
      assignedToUserId: c.assignedToUserId,
      assigneeName: c.assignedToUserId
        ? (assigneeMap.get(c.assignedToUserId) ?? null)
        : null,
      status: c.status,
      unreadCount: c.unreadCount,
      lastMessageBody: c.lastMessageBody,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
      lastInboundAt: c.lastInboundAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    }));

    return paginate(items, total, query);
  }

  async listMessages(
    workspaceId: string,
    conversationId: string,
    query: { skip: number; take: number; page?: number; pageSize?: number },
  ): Promise<Paginated<AdminMessageRow>> {
    await this.requireConversation(workspaceId, conversationId);

    const [rows, total] = await this.messages.findAndCount({
      where: { workspaceId, conversationId },
      order: { timestamp: 'ASC' },
      skip: query.skip,
      take: query.take,
    });

    const items: AdminMessageRow[] = rows.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      status: m.status,
      body: m.body,
      timestamp: m.timestamp.toISOString(),
      templateName: m.templateName,
      metaMessageId: m.metaMessageId,
      failureCode: m.failureCode,
      failureReason: m.failureReason,
    }));

    return paginate(items, total, query);
  }

  async listAssignmentEvents(
    workspaceId: string,
    conversationId: string,
  ): Promise<AdminAssignmentEventRow[]> {
    await this.requireConversation(workspaceId, conversationId);

    const rows = await this.assignmentEvents.find({
      where: { workspaceId, conversationId },
      order: { createdAt: 'ASC' },
    });

    return rows.map((e) => ({
      id: e.id,
      conversationId: e.conversationId,
      actorUserId: e.actorUserId,
      actorType: e.actorType,
      action: e.action,
      fromUserId: e.fromUserId,
      toUserId: e.toUserId,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async forceAssign(
    workspaceId: string,
    conversationId: string,
    dto: AdminForceAssignDto,
    staffId: string,
  ): Promise<{ conversationId: string; assignedToUserId: string | null }> {
    const conversation = await this.requireConversation(
      workspaceId,
      conversationId,
    );

    const previousAssignee = conversation.assignedToUserId;
    const newAssignee = dto.assignedToUserId ?? null;
    const action = newAssignee ? 'ASSIGN' : 'UNASSIGN';

    // Update conversation.
    conversation.assignedToUserId = newAssignee;
    await this.conversations.save(conversation);

    // Sync contact assignee if linked.
    if (conversation.contactId) {
      await this.contacts.update(
        { id: conversation.contactId, workspaceId },
        { assignedToUserId: newAssignee },
      );
    }

    // Write assignment event.
    const event = this.assignmentEvents.create({
      workspaceId,
      conversationId,
      actorUserId: staffId,
      actorType: 'platform_staff',
      action,
      fromUserId: previousAssignee,
      toUserId: newAssignee,
    });
    await this.assignmentEvents.save(event);

    // Fire SSE to notify workspace clients.
    void this.realtime
      .publishInboxUpdated(workspaceId, conversationId, 'assignment', {
        contactName: conversation.contactName,
        contactPhone: conversation.contactPhone,
      })
      .catch(() => undefined);

    return { conversationId, assignedToUserId: newAssignee };
  }

  async getMembersLoad(workspaceId: string): Promise<AdminMemberLoadRow[]> {
    const members = await this.members.find({
      where: { workspaceId, status: MemberStatus.ACTIVE },
      relations: { user: true },
      order: { role: 'ASC' },
    });

    if (members.length === 0) return [];

    const userIds = members.map((m) => m.userId);

    // Count open conversations per assignee for this workspace.
    const counts = await this.conversations
      .createQueryBuilder('c')
      .select('c.assigned_to_user_id', 'userId')
      .addSelect('COUNT(*)', 'cnt')
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.status = :status', { status: 'open' })
      .andWhere('c.assigned_to_user_id IN (:...userIds)', { userIds })
      .groupBy('c.assigned_to_user_id')
      .getRawMany<{ userId: string; cnt: string }>();

    const countMap = new Map(counts.map((r) => [r.userId, Number(r.cnt)]));

    return members.map((m) => ({
      userId: m.userId,
      fullName: m.user?.fullName ?? '',
      email: m.user?.email ?? '',
      role: m.role,
      status: m.status,
      openChats: countMap.get(m.userId) ?? 0,
    }));
  }

  private async requireConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<WaConversation> {
    const conversation = await this.conversations.findOne({
      where: { id: conversationId, workspaceId },
    });
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }
}
