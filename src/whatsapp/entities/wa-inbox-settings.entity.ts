import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Index('uq_wa_inbox_settings_workspace', ['workspaceId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_inbox_settings' })
export class WaInboxSettings extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'round_robin_enabled', type: 'boolean', default: false })
  roundRobinEnabled!: boolean;

  @Column({ name: 'last_routed_user_id', type: 'uuid', nullable: true })
  lastRoutedUserId!: string | null;

  /**
   * Grace window for keyword auto-replies: an inbound message is not
   * auto-replied to when a human agent already replied in this conversation
   * within the last N seconds. 0 = always auto-reply on a keyword match.
   */
  @Column({ name: 'auto_reply_delay_seconds', type: 'int', default: 0 })
  autoReplyDelaySeconds!: number;
}
