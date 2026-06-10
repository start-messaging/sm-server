import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
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

  /** OTP lifetime in seconds — exposed so responses can tell clients. */
  ttlSec(): number {
    return this.config.get('OTP_TTL_MIN', { infer: true }) * 60;
  }

  /** Issue cooldown in seconds — exposed so responses can tell clients. */
  cooldownSec(): number {
    return this.config.get('OTP_RESEND_COOLDOWN_SEC', { infer: true });
  }

  async issue(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
    channel: OtpChannel = OtpChannel.EMAIL,
  ): Promise<{ verificationToken: string; code: string }> {
    await this.assertCooldown(subjectType, subjectId, purpose);
    return this.mint(subjectType, subjectId, purpose, channel);
  }

  /**
   * Invalidate any open codes and issue a fresh one. The cooldown check runs
   * BEFORE invalidation — a 429 after invalidating would strand the subject
   * with zero valid codes. Every send path (signup, resend, set-mobile) goes
   * through here or `issue`, so the cooldown can never be bypassed.
   */
  async reissue(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
    channel: OtpChannel = OtpChannel.EMAIL,
  ): Promise<{ verificationToken: string; code: string }> {
    await this.assertCooldown(subjectType, subjectId, purpose);
    await this.invalidateOpen(subjectType, subjectId, purpose);
    return this.mint(subjectType, subjectId, purpose, channel);
  }

  /** Look an OTP row up by its (plaintext, unique) verification token. */
  findByToken(verificationToken: string): Promise<OtpVerification | null> {
    return this.otps.findOne({ where: { verificationToken } });
  }

  /**
   * Latest USABLE OTP for a subject+purpose: unconsumed, unexpired, and not
   * attempt-locked — a locked row can never verify, so reusing its token
   * (ensureEmailVerification) would hand the caller a guaranteed dead end.
   */
  findOpen(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
  ): Promise<OtpVerification | null> {
    const maxAttempts = this.config.get('OTP_MAX_ATTEMPTS', { infer: true });
    return this.otps.findOne({
      where: {
        subjectType,
        subjectId,
        purpose,
        consumedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
        attempts: LessThan(maxAttempts),
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Seconds until a new code may be issued, based on the given row's age.
   * 0 = no wait (also when the row is null or the knob is 0).
   */
  cooldownRemainingSec(latest: OtpVerification | null): number {
    const cooldown = this.cooldownSec();
    if (!latest || cooldown === 0) return 0;
    const elapsedSec = (Date.now() - latest.createdAt.getTime()) / 1000;
    return Math.max(0, Math.ceil(cooldown - elapsedSec));
  }

  private async assertCooldown(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    if (this.cooldownSec() === 0) return;
    // Latest row regardless of consumed state — invalidation must not reset
    // the clock, or invalidate-then-issue would always bypass the cooldown.
    const latest = await this.otps.findOne({
      where: { subjectType, subjectId, purpose },
      order: { createdAt: 'DESC' },
    });
    const retryAfterSec = this.cooldownRemainingSec(latest);
    if (retryAfterSec > 0) {
      this.logger.warn(
        { event: 'otp.cooldown', subjectType, subjectId, purpose },
        'Otp',
      );
      throw new AppException(
        {
          code: 'OTP_COOLDOWN',
          message: 'Please wait before requesting another code',
          details: { retryAfterSec },
        },
        429,
      );
    }
  }

  private async mint(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
    channel: OtpChannel,
  ): Promise<{ verificationToken: string; code: string }> {
    const code = this.hash.numericCode(6);
    const verificationToken = this.hash.randomToken(32);
    const otp = this.otps.create({
      subjectType,
      subjectId,
      purpose,
      channel,
      verificationToken,
      codeHash: await this.password.hash(code),
      expiresAt: new Date(Date.now() + this.ttlSec() * 1000),
    });
    await this.otps.save(otp);
    this.logger.log(
      { event: 'otp.issued', subjectType, subjectId, purpose },
      'Otp',
    );
    return { verificationToken, code };
  }

  /**
   * Consume any open (unconsumed) OTPs for a subject+purpose. Called before
   * re-issuing so a stale code for a previously entered destination (e.g. an
   * earlier phone number) can never verify the new one.
   */
  async invalidateOpen(
    subjectType: AuthSubject,
    subjectId: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    await this.otps.update(
      { subjectType, subjectId, purpose, consumedAt: IsNull() },
      { consumedAt: new Date() },
    );
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
