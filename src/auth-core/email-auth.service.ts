import { AppLogger } from '../common/logger/app-logger.service';
import { MailerService } from '../mailer/mailer.service';
import { OtpPurpose } from '../otp/entities/otp-verification.entity';
import { OtpService } from '../otp/otp.service';
import { PasswordService } from '../security/password.service';
import { SessionStore } from '../sessions/session-store.service';
import { BaseAuthService } from './base-auth.service';

/**
 * Adds email-OTP verification to the base flow. Extended by actors that
 * self-register and verify their email (customers, referral partners).
 */
export abstract class EmailAuthService<
  P extends { id: string; email: string },
  Profile,
> extends BaseAuthService<P, Profile> {
  protected constructor(
    sessions: SessionStore,
    passwords: PasswordService,
    logger: AppLogger,
    protected readonly otp: OtpService,
    protected readonly mailer: MailerService,
  ) {
    super(sessions, passwords, logger);
  }

  protected async startEmailVerification(
    subjectId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<{ verificationToken: string; code: string }> {
    const issued = await this.otp.issue(this.subject, subjectId, purpose);
    await this.mailer.sendOtp(email, issued.code, purpose);
    return issued;
  }

  protected completeEmailVerification(
    verificationToken: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<string> {
    return this.otp.verify(verificationToken, code, purpose, this.subject);
  }

  /**
   * Guarantee the subject has a usable email verification without hitting the
   * issue cooldown: if a usable open code was sent moments ago, hand back ITS
   * token with its REMAINING expiry/cooldown (no re-send — the emailed code is
   * still valid for it); otherwise invalidate and issue fresh. Used by
   * resumable signup and unverified-login recovery, where a 429 would dead-end
   * the user. `code` is only present when a new code was actually minted.
   *
   * Residual 429: when no USABLE open row exists (consumed mid-verify or
   * attempt-locked) but a recent row still holds the cooldown, the reissue can
   * throw OTP_COOLDOWN — callers decide how to degrade (login recovery falls
   * back to the plain error; signup surfaces the 429).
   */
  protected async ensureEmailVerification(
    subjectId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<{
    verificationToken: string;
    code?: string;
    expiresInSec?: number;
    resendCooldownSec?: number;
  }> {
    const open = await this.otp.findOpen(this.subject, subjectId, purpose);
    if (open) {
      const remainingCooldown = this.otp.cooldownRemainingSec(open);
      if (remainingCooldown > 0) {
        return {
          verificationToken: open.verificationToken,
          expiresInSec: Math.max(
            0,
            Math.floor((open.expiresAt.getTime() - Date.now()) / 1000),
          ),
          resendCooldownSec: remainingCooldown,
        };
      }
    }
    const issued = await this.otp.reissue(this.subject, subjectId, purpose);
    await this.mailer.sendOtp(email, issued.code, purpose);
    return issued;
  }

  /**
   * Explicit "send me a new code" — strict: surfaces OTP_COOLDOWN (429) so the
   * UI can show a retry countdown. Used by the resend endpoints.
   */
  protected async resendEmailVerification(
    subjectId: string,
    email: string,
    purpose: OtpPurpose,
  ): Promise<{ verificationToken: string; code: string }> {
    const issued = await this.otp.reissue(this.subject, subjectId, purpose);
    await this.mailer.sendOtp(email, issued.code, purpose);
    return issued;
  }
}
