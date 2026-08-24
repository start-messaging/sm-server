import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type AutoReplyMatchType = 'exact' | 'contains' | 'starts_with';
export type AutoReplyType = 'text' | 'template';

@Index('idx_wa_auto_reply_rules_workspace', ['workspaceId'])
@Index('idx_wa_auto_reply_rules_active', ['workspaceId', 'isActive'])
@Entity({ name: 'wa_auto_reply_rules' })
export class WaAutoReplyRule extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** Keywords matched case-insensitively; any one of them triggers the rule. */
  @Column({ type: 'jsonb', default: '[]' })
  keywords!: string[];

  @Column({ name: 'match_type', type: 'varchar', length: 12, default: 'exact' })
  matchType!: AutoReplyMatchType;

  @Column({ name: 'reply_type', type: 'varchar', length: 10, default: 'text' })
  replyType!: AutoReplyType;

  @Column({ name: 'reply_text', type: 'text', nullable: true })
  replyText!: string | null;

  @Column({
    name: 'reply_template_name',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  replyTemplateName!: string | null;

  @Column({
    name: 'reply_template_language',
    type: 'varchar',
    length: 10,
    nullable: true,
  })
  replyTemplateLanguage!: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  /** Lower number is evaluated first; ties break on createdAt ASC. */
  @Column({ type: 'int', default: 0 })
  priority!: number;
}
