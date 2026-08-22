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
}
