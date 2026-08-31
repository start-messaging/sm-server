import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { Workspace } from './workspace.entity';

export enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  AGENT = 'AGENT',
  VIEWER = 'VIEWER',
}

/** Privilege ranking for min-role checks. Higher = more privileged. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.OWNER]: 4,
  [WorkspaceRole.ADMIN]: 3,
  [WorkspaceRole.MANAGER]: 2,
  [WorkspaceRole.AGENT]: 1,
  [WorkspaceRole.VIEWER]: 0,
};

/**
 * Returns true when `memberRole` meets the minimum role gate set on `plan`
 * for `featureKey`. Returns true when no gate is set (open access).
 */
export function rolePassesGate(
  roleGates: Record<string, string>,
  featureKey: string,
  memberRole: WorkspaceRole,
): boolean {
  const minRole = roleGates[featureKey];
  if (!minRole) return true;
  return ROLE_RANK[memberRole] >= (ROLE_RANK[minRole as WorkspaceRole] ?? 0);
}

export enum MemberStatus {
  ACTIVE = 'active',
  INVITED = 'invited',
  SUSPENDED = 'suspended',
}

/** The user↔workspace bridge carrying the role. One membership per pair. */
@Index('uq_workspace_member', ['workspaceId', 'userId'], { unique: true })
@Entity({ name: 'workspace_members' })
export class WorkspaceMember extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    enumName: 'workspace_role_enum',
  })
  role!: WorkspaceRole;

  @Column({
    type: 'enum',
    enum: MemberStatus,
    enumName: 'workspace_member_status_enum',
    default: MemberStatus.ACTIVE,
  })
  status!: MemberStatus;

  /** Who invited this member; null for the founding OWNER. */
  @Column({ name: 'invited_by', type: 'uuid', nullable: true })
  invitedBy!: string | null;

  @Column({ name: 'joined_at', type: 'timestamptz', nullable: true })
  joinedAt!: Date | null;

  /**
   * Whether this member is eligible to receive round-robin assignments.
   * Agents can toggle themselves unavailable (e.g. end of shift).
   */
  @Column({ name: 'inbox_available', type: 'boolean', default: true })
  inboxAvailable!: boolean;
}
