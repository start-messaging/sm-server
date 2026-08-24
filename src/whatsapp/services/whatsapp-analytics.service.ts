import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { WaConversation } from '../entities/wa-conversation.entity';
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

@Injectable()
export class WhatsappAnalyticsService {
  constructor(
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
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
}
