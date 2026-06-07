import type { PlatformRole } from '../enums/platform-role.enum';

/** Claims carried by a platform-staff access token. */
export interface StaffJwtPayload {
  sub: string;
  email: string;
  typ: 'staff';
  platformRole: PlatformRole;
  /** Session id — for instant-logout revocation. */
  sid: string;
}
