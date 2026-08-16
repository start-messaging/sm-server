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

export interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  text?: string;
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  /** Required by Meta when text contains {{n}} variables. */
  example?: {
    body_text?: string[][];
    header_text?: string[];
  };
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

  @Column({ type: 'varchar', length: 20 })
  category!: TemplateCategory;

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
}
