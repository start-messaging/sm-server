import { PlatformStaff, StaffStatus } from './entities/platform-staff.entity';
import { PlatformRole } from './enums/platform-role.enum';

/** Safe public shape of a staff member — never exposes `passwordHash`. */
export interface StaffProfile {
  id: string;
  email: string;
  fullName: string;
  platformRole: PlatformRole;
  status: StaffStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export function presentStaff(s: PlatformStaff): StaffProfile {
  return {
    id: s.id,
    email: s.email,
    fullName: s.fullName,
    platformRole: s.platformRole,
    status: s.status,
    lastLoginAt: s.lastLoginAt,
    createdAt: s.createdAt,
  };
}
