import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PlatformRole } from '../enums/platform-role.enum';
import {
  PLATFORM_ROLES_KEY,
  PlatformAdminGuard,
} from '../guards/platform-admin.guard';
import { StaffJwtGuard } from '../guards/staff-jwt.guard';

/**
 * Protects a route for platform staff. With no roles, any authenticated staff
 * may access; with roles, the staff's `platformRole` must match one of them.
 */
export function StaffAuth(...roles: PlatformRole[]) {
  return applyDecorators(
    SetMetadata(PLATFORM_ROLES_KEY, roles),
    UseGuards(StaffJwtGuard, PlatformAdminGuard),
    ApiBearerAuth(),
  );
}
