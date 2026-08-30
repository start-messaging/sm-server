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

/** One validated row from a campaign's "Upload CSV" audience step. */
export interface CampaignAudienceCsvEntry {
  phoneE164: string;
  name?: string;
  attrs?: Record<string, string>;
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

  /** Validated rows from the "Upload CSV" audience step; sent alongside audienceIds. */
  @Column({ name: 'audience_csv', type: 'jsonb', default: '[]' })
  audienceCsv!: CampaignAudienceCsvEntry[];

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'launched_at', type: 'timestamptz', nullable: true })
  launchedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /** Publicly accessible URL for a media HEADER component (image/video/document). */
  @Column({
    name: 'header_media_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  headerMediaUrl!: string | null;

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

  /**
   * Recipients the send loop skipped because they had opted out. Reported
   * separately from `stats.failed` — a skip is compliance, not a delivery
   * failure.
   */
  @Column({ name: 'skipped_opted_out', type: 'int', default: 0 })
  skippedOptedOut!: number;

  @Column({ name: 'flow_id', type: 'uuid', nullable: true })
  flowId!: string | null;
}
