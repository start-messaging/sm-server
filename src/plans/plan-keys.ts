/**
 * The plan-limit keys the SERVER enforces. Entitlements are open key-value
 * data (any key may exist on a plan row), but enforcement code must read keys
 * through these constants — a typo'd literal would silently skip a check.
 * Client-only keys (UI gating) don't belong here; the client reads them
 * straight off the workspace payload.
 */
export const PLAN_LIMIT_KEYS = {
  /** Max workspaces a user may OWN per service on this plan. null/absent = unlimited. */
  maxWorkspacesPerService: 'max_workspaces_per_service',
  /** Max members per workspace (member-invite slice). */
  maxMembers: 'max_members',
  /** Max AGENT-role members per workspace (member-invite slice). */
  maxAgents: 'max_agents',
  /** Max WhatsApp contacts per workspace (contact create / CSV import). */
  maxContacts: 'max_contacts',
} as const;

export const PLAN_FEATURE_KEYS = {
  waCampaigns: 'wa_campaigns',
  agentInbox: 'agent_inbox',
  campaignAnalytics: 'campaign_analytics',
  keywordAutoreplies: 'keyword_autoreplies',
  apiAccess: 'api_access',
} as const;
