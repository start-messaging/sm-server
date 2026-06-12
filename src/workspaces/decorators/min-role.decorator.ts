import { SetMetadata } from '@nestjs/common';
import { WorkspaceRole } from '../entities/workspace-member.entity';

export const MIN_ROLE_KEY = 'workspace:minRole';

/**
 * Minimum workspace role for a route guarded by WorkspaceMemberGuard.
 * Compared via ROLE_RANK — @MinRole(ADMIN) admits ADMIN and OWNER.
 */
export const MinRole = (role: WorkspaceRole) => SetMetadata(MIN_ROLE_KEY, role);
