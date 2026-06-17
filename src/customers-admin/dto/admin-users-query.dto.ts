import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '../../users/entities/user.entity';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Sentinel for "belongs to no workspace" in the role filter. */
export const ROLE_FILTER_NONE = 'none';

const ROLE_FILTER_VALUES = [...Object.values(WorkspaceRole), ROLE_FILTER_NONE];

/** Staff-facing customers list: paginated + free-text search + status + role. */
export class AdminUsersQueryDto extends PaginationQueryDto {
  /** Matches email OR full name, case-insensitive substring. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** A WorkspaceRole, or `none` for users with no active membership. */
  @IsOptional()
  @IsIn(ROLE_FILTER_VALUES)
  role?: string;
}
