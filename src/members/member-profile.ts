import type { UserProfile } from '../auth/user-profile';
import type {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import type { WorkspaceInvitation } from './entities/workspace-invitation.entity';

/** An accepted member (the user relation must be loaded). */
export interface MemberView {
  memberId: string;
  userId: string;
  fullName: string;
  email: string;
  role: WorkspaceRole;
  status: MemberStatus;
  invitedBy: string | null;
  joinedAt: string | null;
}

/** A pending invitation — an email that may not have an account yet. */
export interface InvitationView {
  invitationId: string;
  email: string;
  role: WorkspaceRole;
  invitedAt: string;
  expiresAt: string;
}

/** The workspace roster: accepted members + outstanding invitations. */
export interface MemberRoster {
  members: MemberView[];
  invitations: InvitationView[];
}

/** Public preview of an invite link — drives the client's login-vs-signup choice. */
export interface InvitePreview {
  workspaceName: string;
  inviterName: string;
  email: string;
  role: WorkspaceRole;
  accountExists: boolean;
  expired: boolean;
}

/** Invite response (dev token only outside production, mirroring staff). */
export interface InvitationResult {
  invitation: InvitationView;
  inviteToken?: string;
}

export function presentMember(
  member: WorkspaceMember & { user?: { fullName: string; email: string } },
): MemberView {
  return {
    memberId: member.id,
    userId: member.userId,
    fullName: member.user?.fullName ?? '',
    email: member.user?.email ?? '',
    role: member.role,
    status: member.status,
    invitedBy: member.invitedBy,
    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
  };
}

export function presentInvitation(inv: WorkspaceInvitation): InvitationView {
  return {
    invitationId: inv.id,
    email: inv.email,
    role: inv.role,
    invitedAt: inv.createdAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
  };
}

/** Tokens + landing slug returned when a brand-new user claims an invite. */
export interface ClaimResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  slug: string;
}
