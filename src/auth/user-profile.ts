import { User, UserStatus } from '../users/entities/user.entity';

/** Safe public shape of a user — never exposes `passwordHash`. */
export interface UserProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  mobileE164: string | null;
  mobileVerified: boolean;
  countryCode: string | null;
  locale: string | null;
  status: UserStatus;
  createdAt: Date;
}

export function presentUser(u: User): UserProfile {
  return {
    id: u.id,
    email: u.email,
    emailVerified: u.emailVerified,
    fullName: u.fullName,
    mobileE164: u.mobileE164,
    mobileVerified: u.mobileVerified,
    countryCode: u.countryCode,
    locale: u.locale,
    status: u.status,
    createdAt: u.createdAt,
  };
}
