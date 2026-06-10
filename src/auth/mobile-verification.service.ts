import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { parseMobileOrThrow } from '../common/phone/parse-mobile';
import type { EnvVars } from '../config/env.validation';
import { CountriesService } from '../countries/countries.service';
import {
  OtpChannel,
  OtpPurpose,
} from '../otp/entities/otp-verification.entity';
import {
  presentOtpIssue,
  type OtpIssueResponse,
} from '../otp/otp-issue-response';
import { OtpService } from '../otp/otp.service';
import { SmsService } from '../sms/sms.service';
import { UsersService } from '../users/users.service';
import { SetMobileDto } from './dto/set-mobile.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { presentUser, type UserProfile } from './user-profile';

/**
 * Steps 3–4 of registration: stage a mobile number (deriving the user's
 * country from it) and verify it via SMS OTP. User-only — unlike the email
 * flow this is not polymorphic, so it lives beside AuthService, not in
 * auth-core. Changing an already-verified mobile is deferred.
 */
@Injectable()
export class MobileVerificationService {
  constructor(
    private readonly users: UsersService,
    private readonly countries: CountriesService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Stage the number + send the SMS code. Re-posting while unverified
   * overwrites the number and re-issues — it doubles as the resend path
   * (subject to the OTP cooldown, surfaced as 429 OTP_COOLDOWN).
   */
  async setMobile(
    userId: string,
    dto: SetMobileDto,
  ): Promise<OtpIssueResponse> {
    const user = await this.users.getById(userId);
    if (user.mobileVerified) {
      throw new AppException(
        {
          code: 'MOBILE_ALREADY_VERIFIED',
          message: 'Mobile number is already verified',
        },
        409,
      );
    }

    const { e164, countryCode } = parseMobileOrThrow(dto.mobileE164);

    // The derived country must be one we operate in (exists AND active). One
    // code for both missing and inactive — don't leak which.
    const country = await this.countries.findActive(countryCode);
    if (!country) {
      throw new AppException(
        {
          code: 'COUNTRY_NOT_SUPPORTED',
          message: 'This country is not supported yet',
        },
        400,
      );
    }

    await this.assertMobileFree(e164, userId);

    // Cooldown gate first (reissue checks it BEFORE invalidating, so a 429
    // leaves the previous code usable), and only then stage the number — a
    // throttled request must not half-switch the pending mobile.
    const { verificationToken, code } = await this.otp.reissue(
      AuthSubject.USER,
      userId,
      OtpPurpose.MOBILE_CHANGE,
      OtpChannel.SMS,
    );
    await this.users.setPendingMobile(userId, e164, countryCode);
    await this.sms.sendOtp(e164, code, 'mobile');

    this.logger.log(
      { event: 'user.mobile.set', id: userId, country: countryCode },
      'Auth',
    );
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return presentOtpIssue(this.otp, { verificationToken, code }, isProd);
  }

  /** Verify the SMS code and flip the flag. Returns the updated profile. */
  async verifyMobileOtp(
    userId: string,
    dto: VerifyOtpDto,
  ): Promise<UserProfile> {
    const subjectId = await this.otp.verify(
      dto.verificationToken,
      dto.code,
      OtpPurpose.MOBILE_CHANGE,
      AuthSubject.USER,
    );
    // A token minted for another account must not verify this one.
    if (subjectId !== userId) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }

    const user = await this.users.getById(userId);
    if (!user.mobileE164) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'No mobile number pending' },
        400,
      );
    }
    // Advisory re-check; the partial unique index settles races at save time.
    await this.assertMobileFree(user.mobileE164, userId);
    const saved = await this.users.markMobileVerified(userId);

    this.logger.log({ event: 'user.mobile.verified', id: userId }, 'Auth');
    return presentUser(saved);
  }

  private async assertMobileFree(e164: string, selfId: string): Promise<void> {
    const holder = await this.users.findByVerifiedMobile(e164);
    if (holder && holder.id !== selfId) {
      throw new AppException(
        {
          code: 'MOBILE_TAKEN',
          message: 'This mobile number is already in use',
        },
        409,
      );
    }
  }
}
