import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Index('idx_wa_quick_replies_workspace', ['workspaceId'])
@Index('uq_wa_quick_replies_workspace_shortcut', ['workspaceId', 'shortcut'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_quick_replies' })
export class WaQuickReply extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  /** Stored without leading `/`. */
  @Column({ type: 'varchar', length: 40 })
  shortcut!: string;
}
