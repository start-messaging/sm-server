import type { UserStatus } from '../users/entities/user.entity';
import type { WorkspaceRole } from '../workspaces/entities/workspace-member.entity';

/** One row in the staff-facing customers list. */
export interface AdminUserListItem {
  id: string;
  email: string;
  fullName: string;
  countryCode: string | null;
  status: UserStatus;
  mobileVerified: boolean;
  workspacesCount: number;
  roles: WorkspaceRole[];
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * One workspace card on the user-detail page. `overrideCount` counts DISTINCT
 * overridden (service, country, category) CELLS — not rung rows — so a 7-tier
 * ladder reads as "1 custom rate", not 7.
 */
export interface AdminUserWorkspaceCard {
  id: string;
  name: string;
  slug: string;
  serviceKey: string;
  serviceName: string;
  countryCode: string;
  defaultCurrency: string;
  planCode: string;
  planName: string;
  role: WorkspaceRole;
  status: string;
  overrideCount: number;
  createdAt: Date;
}

/** Full shape for GET /v1/admin/users/:id. */
export interface AdminUserDetail {
  user: AdminUserListItem & {
    emailVerified: boolean;
    mobileE164: string | null;
    locale: string | null;
  };
  workspaces: AdminUserWorkspaceCard[];
}
