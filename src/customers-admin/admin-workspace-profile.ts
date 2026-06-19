import type {
  MemberStatus,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';

/** One person on a workspace — links back to their customer page in the UI. */
export interface AdminWorkspaceMember {
  userId: string;
  fullName: string;
  email: string;
  role: WorkspaceRole;
  status: MemberStatus;
}

/** A pending invitation shown read-only in the staff 360° view. */
export interface AdminWorkspaceInvitation {
  email: string;
  role: WorkspaceRole;
  invitedAt: Date;
  expiresAt: Date;
}

/** Full shape for GET /v1/admin/workspaces/:id — the staff 360° header. */
export interface AdminWorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  countryCode: string;
  countryName: string;
  defaultCurrency: string;
  timezone: string | null;
  createdAt: Date;
  plan: { id: string; code: string; name: string } | null;
  owner: { id: string; fullName: string; email: string } | null;
  membersCount: number;
  /** Active members, owner-first. */
  members: AdminWorkspaceMember[];
  /** Outstanding (pending) invitations — read-only in the admin console. */
  invitations: AdminWorkspaceInvitation[];
  services: {
    serviceKey: string;
    serviceName: string;
    status: string;
    activatedAt: Date | null;
  }[];
  /** DISTINCT overridden (service, country, category) cells — not rung rows. */
  overrideCount: number;
}
