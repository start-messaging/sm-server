import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';

export enum InvitationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REVOKED = 'revoked',
}

/**
 * A pending offer to join a workspace, keyed by EMAIL — which may not map to a
 * user yet (Slack/GitHub model). Kept separate from `workspace_members` so that
 * table only ever holds real, accepted members (`userId NOT NULL`); a member
 * row is created on accept/claim. The scaffolded `workspace_members.INVITED`
 * status is therefore vestigial (members are born `active`).
 *
 * Token model mirrors the staff invite (`platform_staff.inviteTokenHash`): the
 * raw token is emailed once, only its sha256 is stored, with a 7-day expiry.
 * `email` is stored lowercased; a partial-unique index allows exactly one LIVE
 * (pending) invite per email per workspace while keeping accepted/revoked
 * history.
 */
@Index('idx_workspace_invitation_token', ['tokenHash'])
@Index('uq_workspace_invitation_pending', ['workspaceId', 'email'], {
  unique: true,
  where: "status = 'pending'",
})
@Entity({ name: 'workspace_invitations' })
export class WorkspaceInvitation extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  /** The invitee's email (may have no account yet). `citext` like `users.email`
   *  so matching is case-insensitive; still stored lowercased for cleanliness. */
  @Column({ type: 'citext' })
  email!: string;

  /** Never OWNER (enforced at the API edge). */
  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    enumName: 'workspace_role_enum',
  })
  role!: WorkspaceRole;

  /** sha256 of the one-time invite token; the raw value is only emailed. */
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  /** The acting member's userId who sent the invite. */
  @Column({ name: 'invited_by', type: 'uuid' })
  invitedBy!: string;

  @Column({
    type: 'enum',
    enum: InvitationStatus,
    enumName: 'workspace_invitation_status_enum',
    default: InvitationStatus.PENDING,
  })
  status!: InvitationStatus;

  /** Set when accepted — the user who claimed this invite. */
  @Column({ name: 'accepted_user_id', type: 'uuid', nullable: true })
  acceptedUserId!: string | null;

  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null;
}
