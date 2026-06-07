import {
  ReferralPartner,
  ReferralPartnerStatus,
} from './entities/referral-partner.entity';

/** Safe public shape of a referral partner — never exposes `passwordHash`. */
export interface ReferralPartnerProfile {
  id: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  mobileE164: string | null;
  mobileVerified: boolean;
  status: ReferralPartnerStatus;
  createdAt: Date;
}

export function presentPartner(p: ReferralPartner): ReferralPartnerProfile {
  return {
    id: p.id,
    email: p.email,
    emailVerified: p.emailVerified,
    fullName: p.fullName,
    mobileE164: p.mobileE164,
    mobileVerified: p.mobileVerified,
    status: p.status,
    createdAt: p.createdAt,
  };
}
