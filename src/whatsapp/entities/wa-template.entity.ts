import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { WabaAccount } from './waba-account.entity';

export type TemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED';

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

/** One button inside a BUTTONS component (Graph create payload). */
export interface TemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  /** URL {{1}} sample — the variable suffix only, e.g. `summer2023`. */
  example?: string[];
  phone_number?: string;
}

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  text?: string;
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  /**
   * HEADER format IMAGE/VIDEO/DOCUMENT only: publicly-accessible media URL,
   * passed through to Meta unchanged. See open issue in create-template.dto.ts
   * — Meta's real API may require example.header_handle instead.
   */
  link?: string;
  /** Required by Meta when text contains {{n}} variables. */
  example?: {
    body_text?: string[][];
    header_text?: string[];
  };
  /** BUTTONS component only. */
  buttons?: TemplateButton[];
}

@Index('idx_wa_templates_waba', ['wabaAccountId'])
@Index('idx_wa_templates_workspace', ['workspaceId'])
@Index(
  'uq_wa_templates_waba_name_lang',
  ['wabaAccountId', 'name', 'language'],
  {
    unique: true,
    where: 'deleted_at IS NULL',
  },
)
@Entity({ name: 'wa_templates' })
export class WaTemplate extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'waba_account_id', type: 'uuid' })
  wabaAccountId!: string;

  @ManyToOne(() => WabaAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount?: WabaAccount;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  /** Current Meta category (source of truth after sync / category webhooks). */
  @Column({ type: 'varchar', length: 20 })
  category!: TemplateCategory;

  /** Category we submitted at create time. Used to detect Meta recategorization. */
  @Column({
    name: 'submitted_category',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  submittedCategory!: TemplateCategory | null;

  /**
   * Impending Meta category when `correct_category` ≠ `category`.
   * Null when the live category already matches Meta's correction.
   */
  @Column({
    name: 'correct_category',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  correctCategory!: TemplateCategory | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: TemplateStatus;

  @Column({ type: 'jsonb', default: '[]' })
  components!: TemplateComponent[];

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  /** Meta's template id — used for Graph API delete calls. */
  @Column({
    name: 'meta_template_id',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  metaTemplateId!: string | null;

  /**
   * Meta's quality signal for this template: 'HIGH' | 'MEDIUM' | 'LOW'.
   * Updated by `message_template_quality_update` webhooks. Null until Meta
   * has sent the first quality event (new templates start without a score).
   */
  @Column({
    name: 'quality_score',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  qualityScore!: string | null;
}
