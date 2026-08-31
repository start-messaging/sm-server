import type { PlanFeatures, PlanLimits } from '../plans/entities/plan.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
} from './entities/workspace-member.entity';
import { Workspace } from './entities/workspace.entity';

/** Lean row for lists, the launcher, and the sidebar switcher. */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  /** The service this workspace was created under (one per workspace). */
  serviceKey: string;
  countryCode: string;
  defaultCurrency: string;
  planCode: string;
  role: WorkspaceRole;
  status: string;
}

/**
 * Full shape for the workspace shell (GET /workspaces/:slug). Entitlements are
 * OPEN key-value sets — the client gates UI off whatever keys exist (absent
 * feature = off, absent/null limit = unlimited); the server stays the
 * authority for enforcement.
 */
export interface CurrentWorkspaceProfile extends WorkspaceSummary {
  timezone: string | null;
  planFeatures: PlanFeatures;
  planLimits: PlanLimits;
  planRoleGates: Record<string, string>;
}

export function presentWorkspaceSummary(
  workspace: Workspace,
  serviceKey: string,
  member: Pick<WorkspaceMember, 'role'>,
): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    serviceKey,
    countryCode: workspace.countryCode,
    defaultCurrency: workspace.defaultCurrency,
    planCode: workspace.plan?.code ?? '',
    role: member.role,
    status: workspace.status,
  };
}

export function presentCurrentWorkspace(
  workspace: Workspace,
  serviceKey: string,
  member: Pick<WorkspaceMember, 'role'>,
): CurrentWorkspaceProfile {
  return {
    ...presentWorkspaceSummary(workspace, serviceKey, member),
    timezone: workspace.timezone,
    planFeatures: workspace.plan?.features ?? {},
    planLimits: workspace.plan?.limits ?? {},
    planRoleGates: workspace.plan?.roleGates ?? {},
  };
}
