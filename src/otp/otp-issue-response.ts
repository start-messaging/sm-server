import type { OtpService } from './otp.service';

/**
 * Public shape of every "we sent (or re-used) a code" response — signup,
 * set-mobile, resend, and the USER_NOT_VERIFIED recovery details all return
 * it, so clients handle one contract.
 */
export interface OtpIssueResponse {
  verificationToken: string;
  /** Seconds until the code expires — clients size their resume-state TTL on it. */
  expiresInSec: number;
  /** Seconds the client should wait before offering resend. */
  resendCooldownSec: number;
  /** The raw code — non-production only, and only when a code was freshly sent. */
  devCode?: string;
}

/**
 * `code` is absent when an open OTP was re-used within the cooldown window;
 * in that case the issuer supplies the REMAINING expiry/cooldown of the reused
 * row, so clients never size storage TTLs or countdowns past the truth.
 */
export function presentOtpIssue(
  otp: OtpService,
  issued: {
    verificationToken: string;
    code?: string;
    expiresInSec?: number;
    resendCooldownSec?: number;
  },
  isProd: boolean,
): OtpIssueResponse {
  return {
    verificationToken: issued.verificationToken,
    expiresInSec: issued.expiresInSec ?? otp.ttlSec(),
    resendCooldownSec: issued.resendCooldownSec ?? otp.cooldownSec(),
    ...(isProd || !issued.code ? {} : { devCode: issued.code }),
  };
}
