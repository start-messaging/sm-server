import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type CampaignStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PAUSED'
  | 'FAILED';

export interface CampaignStats {
  total: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
}

@Index('idx_wa_campaigns_workspace', ['workspaceId'])
@Index('idx_wa_campaigns_status', ['workspaceId', 'status'])
@Entity({ name: 'wa_campaigns' })
export class WaCampaign extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'DRAFT' })
  status!: CampaignStatus;

  @Column({ name: 'template_name', type: 'varchar', length: 512 })
  templateName!: string;

  @Column({ name: 'template_language', type: 'varchar', length: 10 })
  templateLanguage!: string;

  /** Contact IDs or segment identifiers for the audience. */
  @Column({ name: 'audience_ids', type: 'jsonb', default: '[]' })
  audienceIds!: string[];

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'launched_at', type: 'timestamptz', nullable: true })
  launchedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /**
   * Maps template variable position ("1", "2", …) to:
   * `name` | `phone` | `attr:<key>` | `text:<literal>` (same value for every recipient).
   */
  @Column({
    name: 'variable_mapping',
    type: 'jsonb',
    default: '{}',
  })
  variableMapping!: Record<string, string>;

  @Column({
    type: 'jsonb',
    default: '{"total":0,"sent":0,"delivered":0,"read":0,"failed":0}',
  })
  stats!: CampaignStats;
}
