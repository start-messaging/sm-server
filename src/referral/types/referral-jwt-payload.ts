/** Claims carried by a referral-partner access token. */
export interface ReferralJwtPayload {
  sub: string;
  email: string;
  typ: 'referral';
  /** Session id — for instant-logout revocation. */
  sid: string;
}
