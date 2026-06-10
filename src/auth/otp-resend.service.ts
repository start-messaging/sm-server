import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { EnvVars } from '../config/env.validation';
import { MailerService } from '../mailer/mailer.service';
import { OtpPurpose } from '../otp/entities/otp-verification.entity';
import {
  presentOtpIssue,
  type OtpIssueResponse,
} from '../otp/otp-issue-response';
import { OtpService } from '../otp/otp.service';
import { UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ResendOtpDto } from './dto/resend-otp.dto';

/**
 * Public "send me a new signup code" keyed on the verification token the
 * caller already holds — no password needed, so a reloaded wizard can resend.
 * SIGNUP/email ONLY by design: this route is unauthenticated and must never be
 * able to trigger SMS sends (mobile resend = re-POST the authed /auth/mobile).
 * A stale or expired token is a valid lookup handle — the new code always goes
 * to the account's stored email, so the token can't redirect delivery.
 */
@Injectable()
export class OtpResendService {
  constructor(
    private readonly users: UsersService,
    private readonly otp: OtpService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  async resendSignupOtp(dto: ResendOtpDto): Promise<OtpIssueResponse> {
    const row = await this.otp.findByToken(dto.verificationToken);
    if (
      !row ||
      row.subjectType !== AuthSubject.USER ||
      row.purpose !== OtpPurpose.SIGNUP
    ) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    const user = await this.users.findById(row.subjectId);
    if (!user) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    if (user.emailVerified) {
      throw new AppException(
        {
          code: 'EMAIL_ALREADY_VERIFIED',
          message: 'This email is already verified',
        },
        409,
      );
    }
    // Only a live pending registration may pump codes — e.g. a suspended
    // account must not be able to re-activate itself via verify-otp.
    if (user.status !== UserStatus.PENDING_VERIFICATION) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    const issued = await this.otp.reissue(
      AuthSubject.USER,
      user.id,
      OtpPurpose.SIGNUP,
    );
    await this.mailer.sendOtp(user.email, issued.code, OtpPurpose.SIGNUP);
    this.logger.log({ event: 'otp.resent', id: user.id }, 'Auth');
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return presentOtpIssue(this.otp, issued, isProd);
  }
}
