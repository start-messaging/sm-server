import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { RedisService } from '../../redis/redis.service';
import {
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../../workspaces/entities/workspace-member.entity';
import { User } from '../../users/entities/user.entity';
import { WaConversation } from '../entities/wa-conversation.entity';

const PRESENCE_TTL_SECONDS = 45;

export interface PresenceEntry {
  userId: string;
  fullName: string;
}

@Injectable()
export class WhatsappInboxPresenceService {
  private readonly logger = new Logger(WhatsappInboxPresenceService.name);

  constructor(
    private readonly redis: RedisService,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  /**
   * Heartbeat: record the caller as currently viewing the conversation.
   * Redis key: `inbox:presence:{workspaceId}:{conversationId}:{userId}` with 45s TTL.
   * Enforces the same AGENT ACL as reading messages — AGENTs can only heartbeat
   * on their own assigned conversations.
   * Fails soft if Redis is down (returns without error).
   */
  async heartbeat(
    workspaceId: string,
    conversationId: string,
    membership: WorkspaceMember,
  ): Promise<void> {
    await this.assertConversationAccess(
      workspaceId,
      conversationId,
      membership,
    );

    const fullName = await this.resolveFullName(membership.userId);
    const entry: PresenceEntry = { userId: membership.userId, fullName };

    try {
      await this.redis.set(
        this.presenceKey(workspaceId, conversationId, membership.userId),
        JSON.stringify(entry),
        PRESENCE_TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(
        `presence heartbeat Redis write failed (workspace=${workspaceId} conv=${conversationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Returns all users whose heartbeat TTL has not yet expired.
   * Enforces the same AGENT ACL as reading messages.
   * Falls back to `{ viewers: [] }` if Redis is unavailable.
   */
  async getViewers(
    workspaceId: string,
    conversationId: string,
    membership: WorkspaceMember,
  ): Promise<{ viewers: PresenceEntry[] }> {
    await this.assertConversationAccess(
      workspaceId,
      conversationId,
      membership,
    );

    try {
      const pattern = this.presencePattern(workspaceId, conversationId);
      const keys = await this.scanKeys(pattern);
      if (!keys.length) return { viewers: [] };

      const raw = await this.redis.raw.mget(...keys);
      const viewers: PresenceEntry[] = [];
      for (const v of raw) {
        if (!v) continue;
        try {
          viewers.push(JSON.parse(v) as PresenceEntry);
        } catch {
          // skip malformed entry
        }
      }
      return { viewers };
    } catch (err) {
      this.logger.warn(
        `presence getViewers Redis read failed (workspace=${workspaceId} conv=${conversationId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { viewers: [] };
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private presenceKey(
    workspaceId: string,
    conversationId: string,
    userId: string,
  ): string {
    return `inbox:presence:${workspaceId}:${conversationId}:${userId}`;
  }

  private presencePattern(workspaceId: string, conversationId: string): string {
    return `inbox:presence:${workspaceId}:${conversationId}:*`;
  }

  /**
   * SCAN is used over KEYS to avoid blocking large Redis instances.
   * Presence sets are small (<10 concurrent viewers per conversation).
   */
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.raw.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        50,
      );
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    return keys;
  }

  /**
   * Mirrors the ACL check in WhatsappMessagesService.listMessages:
   * AGENTs cannot access a conversation assigned to someone else.
   */
  private async assertConversationAccess(
    workspaceId: string,
    conversationId: string,
    membership: WorkspaceMember,
  ): Promise<void> {
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
  }

  /** Cheap single-row lookup — cached at the caller via Redis TTL anyway. */
  private async resolveFullName(userId: string): Promise<string> {
    try {
      const user = await this.users.findOne({
        where: { id: userId },
        select: ['id', 'fullName'],
      });
      return user?.fullName ?? '';
    } catch {
      return '';
    }
  }
}
