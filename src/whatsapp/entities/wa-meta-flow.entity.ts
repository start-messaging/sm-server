import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Index('idx_wa_meta_flows_workspace', ['workspaceId'])
@Index('uq_wa_meta_flows_meta_id', ['workspaceId', 'metaFlowId'], {
  unique: true,
})
@Entity({ name: 'wa_meta_flows' })
export class WaMetaFlow extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'meta_flow_id', type: 'varchar', length: 40 })
  metaFlowId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 40 })
  status!: string;

  @Column({ type: 'jsonb', default: '[]' })
  categories!: string[];

  @Column({ name: 'synced_at', type: 'timestamptz' })
  syncedAt!: Date;
}
