import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PlatformRole } from '../enums/platform-role.enum';
import type { AuthenticatedStaff } from '../strategies/staff-jwt.strategy';

/** Metadata key for the roles required by `@StaffAuth(...roles)`. */
export const PLATFORM_ROLES_KEY = 'platform_roles';

/**
 * Runs after `StaffJwtGuard` has put the staff principal on the request.
 * Empty role list = any authenticated staff; otherwise the staff's
 * `platformRole` must be in the list.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<PlatformRole[]>(PLATFORM_ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    const req = ctx.switchToHttp().getRequest<Request>();
    const staff = req.user as AuthenticatedStaff | undefined;
    if (!staff) {
      throw new ForbiddenException();
    }
    if (required.length === 0) {
      return true;
    }
    return required.includes(staff.platformRole);
  }
}
