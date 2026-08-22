import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type AssignmentAction =
  | 'ASSIGN'
  | 'CLAIM'
  | 'UNASSIGN'
  | 'TAKEOVER'
  | 'RESOLVE'
  | 'REOPEN';

export type AssignmentActorType = 'workspace_member' | 'platform_staff';

@Index('idx_wa_assignment_events_conversation', [
  'workspaceId',
  'conversationId',
])
@Entity({ name: 'wa_assignment_events' })
export class WaAssignmentEvent extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'actor_type', type: 'varchar', length: 20 })
  actorType!: AssignmentActorType;

  @Column({ type: 'varchar', length: 10 })
  action!: AssignmentAction;

  @Column({ name: 'from_user_id', type: 'uuid', nullable: true })
  fromUserId!: string | null;

  @Column({ name: 'to_user_id', type: 'uuid', nullable: true })
  toUserId!: string | null;
}
