/**
 * Platform staff roles (govern the internal admin surface, never a workspace).
 * Assigned at invite time and carried in the staff JWT; routes gate access with
 * `@StaffAuth(...roles)`. Only SUPER_ADMIN can invite staff and assign roles.
 */
export enum PlatformRole {
  /** Full control, including inviting staff and assigning roles. */
  SUPER_ADMIN = 'SUPER_ADMIN',
  /** Platform administration: manage platform-wide config and operations. */
  ADMIN = 'ADMIN',
  /** Account management for assigned client workspaces. */
  RELATIONSHIP_MANAGER = 'RELATIONSHIP_MANAGER',
  /** Customer support: view workspaces/conversations and assist customers. */
  SUPPORT = 'SUPPORT',
  /** Money: wallets, pricing, refunds, ledger. */
  FINANCE = 'FINANCE',
  /** View-only dashboards and metrics. */
  READ_ONLY = 'READ_ONLY',
}
