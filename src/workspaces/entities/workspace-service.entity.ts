import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Service } from '../../services/entities/service.entity';
import { Workspace } from './workspace.entity';

export enum WorkspaceServiceStatus {
  PENDING_SETUP = 'pending_setup',
  ACTIVE = 'active',
  PAUSED = 'paused',
  FAILED = 'failed',
}

/**
 * Which service a workspace runs — a small enrollment + status row. Created as
 * pending_setup at workspace creation; the provider-connection slice (WABA
 * onboarding) flips it active. Holds NO routing/provider detail: which provider
 * carries the service is connection state that lives on the channel's own
 * connection record (e.g. `waba_accounts`). One service per workspace at creation
 * (locked product decision); the unique pair keeps a future multi-service attach
 * honest.
 */
@Index('uq_workspace_service', ['workspaceId', 'serviceKey'], { unique: true })
@Entity({ name: 'workspace_services' })
export class WorkspaceService extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ name: 'service_key', type: 'varchar', length: 40 })
  serviceKey!: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_key', referencedColumnName: 'key' })
  service?: Service;

  @Column({
    type: 'enum',
    enum: WorkspaceServiceStatus,
    enumName: 'workspace_service_status_enum',
    default: WorkspaceServiceStatus.PENDING_SETUP,
  })
  status!: WorkspaceServiceStatus;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt!: Date | null;
}
