import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { EnvVars } from '../config/env.validation';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import { HashService } from '../security/hash.service';
import { PasswordService } from '../security/password.service';
import {
  OtpChannel,
  OtpPurpose,
  OtpVerification,
} from './entities/otp-verification.entity';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OtpVerification)
    private readonly otps: Repository<OtpVerification>,
    private readonly password: PasswordService,
    private readonly hash: HashService,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  async issue(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
    channel: OtpChannel = OtpChannel.EMAIL,
  ): Promise<{ verificationToken: string; code: string }> {
    const code = this.hash.numericCode(6);
    const verificationToken = this.hash.randomToken(32);
    const ttlMin = this.config.get('OTP_TTL_MIN', { infer: true });
    const otp = this.otps.create({
      subjectType,
      subjectId,
      purpose,
      channel,
      verificationToken,
      codeHash: await this.password.hash(code),
      expiresAt: new Date(Date.now() + ttlMin * 60_000),
    });
    await this.otps.save(otp);
    this.logger.log(
      { event: 'otp.issued', subjectType, subjectId, purpose },
      'Otp',
    );
    return { verificationToken, code };
  }

  /** Verify a code; returns the owning subjectId. Throws on any failure. */
  async verify(
    verificationToken: string,
    code: string,
    purpose: OtpPurpose,
    expectedSubject: AuthSubject,
  ): Promise<string> {
    const otp = await this.otps.findOne({ where: { verificationToken } });
    if (
      !otp ||
      otp.purpose !== purpose ||
      otp.subjectType !== expectedSubject ||
      otp.consumedAt
    ) {
      this.logger.warn(
        { event: 'otp.invalid', purpose, expectedSubject },
        'Otp',
      );
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    if (otp.expiresAt.getTime() < Date.now()) {
      this.logger.warn(
        { event: 'otp.expired', subjectId: otp.subjectId },
        'Otp',
      );
      throw new AppException(
        { code: 'OTP_EXPIRED', message: 'Code has expired' },
        400,
      );
    }
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    if (otp.attempts >= maxAttempts) {
      this.logger.warn(
        { event: 'otp.locked', subjectId: otp.subjectId },
        'Otp',
      );
      throw new AppException(
        { code: 'OTP_LOCKED', message: 'Too many attempts' },
        429,
      );
    }
    const ok = await this.password.verify(otp.codeHash, code);
    if (!ok) {
      otp.attempts += 1;
      await this.otps.save(otp);
      this.logger.warn(
        {
          event: 'otp.wrong_code',
          subjectId: otp.subjectId,
          attempts: otp.attempts,
        },
        'Otp',
      );
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Incorrect code' },
        400,
      );
    }
    otp.consumedAt = new Date();
    await this.otps.save(otp);
    this.logger.log(
      {
        event: 'otp.verified',
        subjectType: otp.subjectType,
        subjectId: otp.subjectId,
        purpose,
      },
      'Otp',
    );
    return otp.subjectId;
  }
}
