import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WorkspaceMember } from '../../workspaces/entities/workspace-member.entity';

export interface AnalyticsOverviewAgent {
  userId: string;
  name: string;
  handled: number;
}

export interface AnalyticsOverview {
  conversationsToday: number;
  resolvedToday: number;
  avgResponseMinutes: number;
  topAgents: AnalyticsOverviewAgent[];
}

export interface AgentStat {
  userId: string;
  name: string;
  conversationsHandled: number;
  messagesSent: number;
  resolutionMinutes: number | null;
}

export interface MessageError {
  errorCode: number | null;
  errorReason: string;
  count: number;
  lastOccurredAt: string;
  fix: string;
}

@Injectable()
export class WhatsappAnalyticsService {
  constructor(
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    private readonly ds: DataSource,
  ) {}

  async overview(workspaceId: string): Promise<AnalyticsOverview> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      conversationsTodayRow,
      resolvedTodayRow,
      avgResponseRows,
      topAgentRows,
    ] = await Promise.all([
      this.conversations
        .createQueryBuilder('c')
        .select('COUNT(*)', 'cnt')
        .where('c.workspace_id = :workspaceId', { workspaceId })
        .andWhere('c.last_message_at >= :startOfToday', { startOfToday })
        .getRawOne<{ cnt: string }>(),
      this.conversations
        .createQueryBuilder('c')
        .select('COUNT(*)', 'cnt')
        .where('c.workspace_id = :workspaceId', { workspaceId })
        .andWhere('c.status = :status', { status: 'resolved' })
        .andWhere('c.resolved_at >= :startOfToday', { startOfToday })
        .getRawOne<{ cnt: string }>(),
      this.ds.query<{ avg_seconds: string | null }[]>(
        `
          WITH ordered AS (
            SELECT
              direction,
              "timestamp",
              LAG(direction) OVER (PARTITION BY conversation_id ORDER BY "timestamp") AS prev_direction,
              LAG("timestamp") OVER (PARTITION BY conversation_id ORDER BY "timestamp") AS prev_timestamp
            FROM wa_messages
            WHERE workspace_id = $1 AND deleted_at IS NULL
          )
          SELECT AVG(EXTRACT(EPOCH FROM ("timestamp" - prev_timestamp))) AS avg_seconds
          FROM ordered
          WHERE direction = 'outbound'
            AND prev_direction = 'inbound'
            AND "timestamp" >= $2
          `,
        [workspaceId, startOfToday],
      ),
      this.conversations
        .createQueryBuilder('c')
        .select('c.assigned_to_user_id', 'userId')
        .addSelect('COUNT(*)', 'handled')
        .where('c.workspace_id = :workspaceId', { workspaceId })
        .andWhere('c.assigned_to_user_id IS NOT NULL')
        .andWhere('c.last_message_at >= :startOfToday', { startOfToday })
        .groupBy('c.assigned_to_user_id')
        .orderBy('handled', 'DESC')
        .limit(5)
        .getRawMany<{ userId: string; handled: string }>(),
    ]);

    const userIds = topAgentRows.map((r) => r.userId);
    const membersByUserId = userIds.length
      ? await this.members.find({
          where: { workspaceId, userId: In(userIds) },
          relations: { user: true },
        })
      : [];
    const nameByUserId = new Map(
      membersByUserId.map((m) => [m.userId, m.user?.fullName ?? 'Unknown']),
    );

    const avgSeconds = Number(avgResponseRows[0]?.avg_seconds ?? 0);

    return {
      conversationsToday: Number(conversationsTodayRow?.cnt ?? 0),
      resolvedToday: Number(resolvedTodayRow?.cnt ?? 0),
      avgResponseMinutes: Math.round((avgSeconds / 60) * 10) / 10,
      topAgents: topAgentRows.map((r) => ({
        userId: r.userId,
        name: nameByUserId.get(r.userId) ?? 'Unknown',
        handled: Number(r.handled),
      })),
    };
  }

  async getAgentStats(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<{ agents: AgentStat[] }> {
    const rows = await this.conversations
      .createQueryBuilder('c')
      .select('c.assigned_to_user_id', 'userId')
      .addSelect('COUNT(*)', 'total')
      .addSelect(
        `AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at)) / 60)`,
        'avgResolutionMinutes',
      )
      .where('c.workspace_id = :workspaceId', { workspaceId })
      .andWhere('c.assigned_to_user_id IS NOT NULL')
      .andWhere('c.created_at BETWEEN :from AND :to', { from, to })
      .andWhere('c.deleted_at IS NULL')
      .groupBy('c.assigned_to_user_id')
      .getRawMany<{
        userId: string;
        total: string;
        avgResolutionMinutes: string | null;
      }>();

    if (!rows.length) return { agents: [] };

    const userIds = rows.map((r) => r.userId);
    const memberList = await this.members.find({
      where: { workspaceId, userId: In(userIds) },
      relations: { user: true },
    });
    const nameByUserId = new Map(
      memberList.map((m) => [m.userId, m.user?.fullName ?? 'Unknown']),
    );

    // Count messages sent per agent using senderId
    const sentRows = await this.ds.query<{ senderId: string; cnt: string }[]>(
      `SELECT sender_id AS "senderId", COUNT(*) AS cnt
       FROM wa_messages
       WHERE workspace_id = $1
         AND sender_id = ANY($2)
         AND direction = 'outbound'
         AND timestamp BETWEEN $3 AND $4
         AND deleted_at IS NULL
       GROUP BY sender_id`,
      [workspaceId, userIds, from, to],
    );
    const sentByUserId = new Map(sentRows.map((r) => [r.senderId, Number(r.cnt)]));

    return {
      agents: rows.map((r) => ({
        userId: r.userId,
        name: nameByUserId.get(r.userId) ?? 'Unknown',
        conversationsHandled: Number(r.total),
        messagesSent: sentByUserId.get(r.userId) ?? 0,
        resolutionMinutes:
          r.avgResolutionMinutes != null
            ? Math.round(Number(r.avgResolutionMinutes))
            : null,
      })),
    };
  }

  async getMessageErrors(
    workspaceId: string,
    from: Date,
    to: Date,
  ): Promise<{ errors: MessageError[] }> {
    const rows = await this.ds.query<
      {
        failureCode: number | null;
        failureReason: string | null;
        cnt: string;
        lastOccurredAt: string;
      }[]
    >(
      `
      SELECT
        failure_code      AS "failureCode",
        MAX(failure_reason) AS "failureReason",
        COUNT(*)          AS cnt,
        MAX(timestamp)    AS "lastOccurredAt"
      FROM wa_messages
      WHERE workspace_id = $1
        AND status = 'failed'
        AND timestamp BETWEEN $2 AND $3
        AND deleted_at IS NULL
      GROUP BY failure_code
      ORDER BY cnt DESC
      `,
      [workspaceId, from, to],
    );

    const FIX_MAP: Record<string, string> = {
      '131008':
        'A template variable was empty for this contact. Use a fixed fallback or ensure the contact field has a value.',
      '131026':
        'The contact had not messaged you within 24 hours. Use a template message to re-open the window.',
      '131047':
        'The template was rejected or paused by Meta. Check its status in the Templates page.',
      '131053':
        "You hit Meta's messaging rate limit. Space out your campaign sends.",
    };
    const DEFAULT_FIX =
      "Unknown error. Check Meta's error documentation at https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes";

    return {
      errors: rows.map((r) => ({
        errorCode: r.failureCode ?? null,
        errorReason: r.failureReason ?? 'Unknown error',
        count: Number(r.cnt),
        lastOccurredAt: r.lastOccurredAt,
        fix: FIX_MAP[String(r.failureCode ?? '')] ?? DEFAULT_FIX,
      })),
    };
  }
}
