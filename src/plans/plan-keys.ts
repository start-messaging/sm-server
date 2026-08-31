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
  /** Reply-button and list messages via the agent inbox. Available on BASIC and above. */
  interactiveMessages: 'interactive_messages',
  /** No-code chatbot flow builder. Available on ADVANCED only. */
  chatbotFlows: 'chatbot_flows',
  /** External REST API for sending messages. Available on BASIC and above. */
  apiTriggers: 'api_triggers',
} as const;

export type EntitlementType = 'feature' | 'limit' | 'capability';

export interface EntitlementDef {
  key: string;
  type: EntitlementType;
  label: string;
  description: string;
  /** For capability entries: the minimum role when not overridden by plan.roleGates. */
  defaultMinRole?: string;
}

export const ENTITLEMENT_CATALOG: EntitlementDef[] = [
  // Features
  { key: 'agent_inbox',          type: 'feature', label: 'Agent Inbox',             description: 'Live inbox for agents to reply to customers in real time.' },
  { key: 'wa_campaigns',         type: 'feature', label: 'WhatsApp Campaigns',       description: 'Bulk template broadcasts to contact lists.' },
  { key: 'campaign_analytics',   type: 'feature', label: 'Campaign Analytics',       description: 'Per-campaign delivery and engagement stats.' },
  { key: 'keyword_autoreplies',  type: 'feature', label: 'Keyword Auto-replies',     description: 'Auto-reply rules triggered by specific inbound keywords.' },
  { key: 'interactive_messages', type: 'feature', label: 'Interactive Messages',     description: 'Reply buttons and list messages in the agent inbox.' },
  { key: 'chatbot_flows',        type: 'feature', label: 'Automation Flows',         description: 'No-code chatbot flow builder (requires ADVANCED).' },
  { key: 'api_access',           type: 'feature', label: 'API Access',               description: 'REST API keys for external integrations.' },
  { key: 'api_triggers',         type: 'feature', label: 'Outbound API Triggers',    description: 'Send template messages via external REST API.' },
  // Capabilities — role-based action gates (not feature on/off; always "enabled")
  { key: 'manage_members',   type: 'capability', defaultMinRole: 'ADMIN',   label: 'Manage Members',        description: 'Invite members, change roles, remove members.' },
  { key: 'write_settings',   type: 'capability', defaultMinRole: 'ADMIN',   label: 'Edit Settings',         description: 'Edit auto-replies, quick replies, and routing rules.' },
  { key: 'manage_campaigns', type: 'capability', defaultMinRole: 'MANAGER', label: 'Manage Campaigns',      description: 'Create and launch broadcast campaigns.' },
  { key: 'activate_flows',   type: 'capability', defaultMinRole: 'MANAGER', label: 'Activate Flows',        description: 'Activate and deactivate automation flows.' },
  { key: 'manage_contacts',  type: 'capability', defaultMinRole: 'AGENT',   label: 'Manage Contacts',       description: 'Edit contact details and import CSV contacts.' },
  { key: 'send_messages',    type: 'capability', defaultMinRole: 'AGENT',   label: 'Send Messages',         description: 'Send messages in the agent inbox.' },
  { key: 'view_analytics',   type: 'capability', defaultMinRole: 'AGENT',   label: 'View Analytics',        description: 'Access analytics and reporting pages.' },
  // Limits
  { key: 'max_workspaces_per_service', type: 'limit', label: 'Max Workspaces',       description: 'Max workspaces a user can own. null = unlimited.' },
  { key: 'max_members',          type: 'limit',   label: 'Max Members',              description: 'Max total workspace members.' },
  { key: 'max_agents',           type: 'limit',   label: 'Max Agents',               description: 'Max AGENT-role members.' },
  { key: 'max_contacts',         type: 'limit',   label: 'Max Contacts',             description: 'Max WhatsApp contacts per workspace.' },
];
