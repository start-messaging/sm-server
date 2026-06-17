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
  /** All members, owner-first. One row (the owner) until invites ship. */
  members: AdminWorkspaceMember[];
  services: {
    serviceKey: string;
    serviceName: string;
    status: string;
    activatedAt: Date | null;
  }[];
  /** DISTINCT overridden (service, country, category) cells — not rung rows. */
  overrideCount: number;
}
