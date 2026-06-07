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
}
