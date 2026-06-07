/**
 * The kinds of identity that can authenticate. Shared by sessions (Redis) and
 * OTP so the same primitives serve every actor.
 */
export enum AuthSubject {
  USER = 'user',
  STAFF = 'staff',
  REFERRAL = 'referral',
}
