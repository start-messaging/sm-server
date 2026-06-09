import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { StaffStatus } from '../entities/platform-staff.entity';
import { PlatformRole } from '../enums/platform-role.enum';

/**
 * Update a staff member's role and/or active status (SUPER_ADMIN only). `status`
 * is limited to `active`/`suspended` — `invited` is only set by the invite flow.
 */
export class UpdateStaffDto {
  @IsOptional()
  @IsEnum(PlatformRole)
  platformRole?: PlatformRole;

  @IsOptional()
  @IsIn([StaffStatus.ACTIVE, StaffStatus.SUSPENDED])
  status?: StaffStatus;
}
