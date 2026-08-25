import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FlowSessionStatus = 'active' | 'paused' | 'completed' | 'exited';

/**
 * A contact's position inside a running flow. Append-only: sessions are never
 * deleted (they are the audit trail of what the bot did), so this entity does
 * not extend BaseEntity and has no soft-delete column. `conversationId` is
 * unique — a conversation can only ever be inside one flow at a time; finished
 * runs stay on the row with a terminal `status`.
 */
@Index('idx_wa_flow_sessions_workspace_flow', ['workspaceId', 'flowId'])
@Index('idx_wa_flow_sessions_workspace_status', ['workspaceId', 'status'])
@Entity({ name: 'wa_flow_sessions' })
export class WaFlowSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'conversation_id', type: 'uuid', unique: true })
  conversationId!: string;

  @Column({ name: 'flow_id', type: 'uuid' })
  flowId!: string;

  @Column({ name: 'current_node_id', type: 'varchar', length: 64 })
  currentNodeId!: string;

  @Column({ type: 'varchar', length: 12, default: 'active' })
  status!: FlowSessionStatus;

  /** Values captured by `wait_for_reply` / `set_field` nodes, for interpolation. */
  @Column({ type: 'jsonb', default: '{}' })
  variables!: Record<string, string>;

  @Column({ name: 'waiting_for_reply', type: 'boolean', default: false })
  waitingForReply!: boolean;

  /** When a delayed step becomes due; null when nothing is scheduled. */
  @Column({ name: 'next_fire_at', type: 'timestamptz', nullable: true })
  nextFireAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
