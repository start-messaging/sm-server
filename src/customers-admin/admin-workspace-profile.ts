import type {
  MemberStatus,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import type {
  WabaAccountStatus,
  WabaVerificationStatus,
} from '../whatsapp/entities/waba-account.entity';
import type {
  WaPhoneNumberStatus,
  WaQualityRating,
} from '../whatsapp/entities/phone-number.entity';
import type { WaSubscriptionStatus } from '../whatsapp/entities/wa-subscription.entity';

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

/** Read-only WhatsApp connect state — GET /v1/admin/workspaces/:id/whatsapp-status. */
export interface AdminWorkspaceWhatsAppStatus {
  /** True when a live (non-deleted) WabaAccount row exists. */
  connected: boolean;
  /** Meta WABA id. Null when not connected. Never the access token. */
  metaWabaId: string | null;
  businessName: string | null;
  webhookSubscribed: boolean;
  wabaStatus: WabaAccountStatus | null;
  verificationStatus: WabaVerificationStatus | null;
  phoneNumbers: {
    displayNumberE164: string;
    verifiedName: string | null;
    qualityRating: WaQualityRating;
    status: WaPhoneNumberStatus;
  }[];
  /** CRM SaaS subscription row — null if none created yet. */
  crmSubscription: { planCode: string; status: WaSubscriptionStatus } | null;
}
