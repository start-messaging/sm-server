import { IsEnum } from 'class-validator';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';

/** Change an existing member's role. Rank/owner rules enforced in the service. */
export class UpdateMemberRoleDto {
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
