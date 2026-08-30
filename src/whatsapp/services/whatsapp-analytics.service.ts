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
      '0': 'An unknown error occurred. Retry the send or contact support if it persists.',
      '1': "An unknown error occurred on Meta's side. Retry after a few minutes.",
      '2': 'Temporary Meta service issue. Retry after a few minutes.',
      '3': 'Unsupported request. Check that your WABA has the required permissions.',
      '4': 'Too many requests sent in a short time. Reduce your send rate.',
      '10': 'Permission denied. Your WhatsApp Business Account may lack the required permission.',
      '100': 'Invalid request parameter. Check that template name, language, and variables are correct.',
      '130429': 'Rate limit hit. You are sending too many messages. Space out your sends and consider reducing campaign audience size.',
      '130472': 'User number is not registered on WhatsApp. Skip this contact.',
      '131000': 'Generic Meta error. Retry the send; if it keeps failing check your WABA status.',
      '131005': "Permission denied. Your WABA doesn't have the required capability for this message type.",
      '131006': 'Template not found or inactive. Ensure the template is approved and the language code matches.',
      '131008': 'A template variable was empty for this contact. Add a fallback value or ensure all required contact fields are filled.',
      '131009': "Invalid parameter value. Check that button URL parameters and variables follow Meta's format rules.",
      '131016': 'The service is temporarily unavailable. Retry after a few minutes.',
      '131021': "Recipient phone number is not a WhatsApp user or doesn't exist.",
      '131026': 'Message not delivered — the contact may not have WhatsApp or the number is invalid.',
      '131042': 'The business account has restrictions. Check your WABA status in Meta Business Manager.',
      '131045': "The sender's WhatsApp phone number is not registered. Re-register the number in your WABA settings.",
      '131047': 'Template paused or rejected by Meta. Go to the Templates page and check the template status.',
      '131048': 'Sending template messages requires a payment method. Add one at business.facebook.com/settings/payment-methods.',
      '131049': 'This message was not delivered to maintain a healthy ecosystem. Reduce marketing frequency and ensure opt-out is honoured.',
      '131051': 'Unsupported message type for this contact.',
      '131052': "Media download failed on Meta's side. Use a publicly accessible URL for media.",
      '131053': 'Daily messaging limit reached. Space out your campaign sends or apply for a higher limit in Meta Business Manager.',
      '131056': 'Too many messages to this number in a short period. Space out sends to this contact.',
      '132000': 'Template variable count mismatch. Ensure your campaign variable mapping covers all template variables.',
      '132001': 'Template not found. Sync your templates and ensure the name/language is correct.',
      '132005': 'Template hydration failed — a required variable was missing. Check variable mapping.',
      '132007': 'Template content policy violation. The template may have been flagged by Meta.',
      '132012': 'Template button URL parameter missing or malformed.',
      '132015': 'Template is paused due to quality issues. Reduce marketing frequency and improve content.',
      '132016': 'Template has been disabled. Create a new template with improved content.',
      '133000': 'Incomplete deregistration. Re-register your phone number to continue sending.',
      '133004': 'Server is temporarily unavailable. Retry after a few minutes.',
      '133005': 'Two-step verification PIN was wrong. Update the PIN in your WABA settings.',
      '133006': 'Phone number needs re-registration. Go to the Connect page and re-register.',
      '133008': 'Too many PIN attempts. Wait before retrying.',
      '133009': 'PIN must be provided during registration.',
      '135000': "Generic user error. Retry; if it persists, check the contact's number.",
    };
    const DEFAULT_FIX =
      "Review the error reason above and check Meta's error code reference at https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes";

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
