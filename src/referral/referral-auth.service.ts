import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import type { AuthContext, TokenPair } from '../auth-core/auth.types';
import { EmailAuthService } from '../auth-core/email-auth.service';
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
import { PasswordService } from '../security/password.service';
import { SessionStore } from '../sessions/session-store.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import {
  ReferralPartner,
  ReferralPartnerStatus,
} from './entities/referral-partner.entity';
import type { ReferralJwtPayload } from './types/referral-jwt-payload';
import {
  presentPartner,
  type ReferralPartnerProfile,
} from './referral-partner-profile';

export interface TokensWithPartner extends TokenPair {
  partner: ReferralPartnerProfile;
}

@Injectable()
export class ReferralAuthService extends EmailAuthService<
  ReferralPartner,
  ReferralPartnerProfile
> {
  protected readonly subject = AuthSubject.REFERRAL;

  constructor(
    sessions: SessionStore,
    passwords: PasswordService,
    logger: AppLogger,
    otp: OtpService,
    mailer: MailerService,
    @InjectRepository(ReferralPartner)
    private readonly partners: Repository<ReferralPartner>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {
    super(sessions, passwords, logger, otp, mailer);
  }

  async register(
    dto: RegisterDto,
    ctx: AuthContext,
  ): Promise<OtpIssueResponse> {
    const existing = await this.partners.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      // Same resumable-signup semantics as customers: an unverified row is a
      // claim, not an account — overwrite it and re-verify. Verified → 409.
      if (
        existing.emailVerified ||
        existing.status !== ReferralPartnerStatus.PENDING_VERIFICATION
      ) {
        throw new AppException(
          { code: 'EMAIL_TAKEN', message: 'Email already registered' },
          409,
        );
      }
      existing.passwordHash = await this.passwords.hash(dto.password);
      existing.fullName = dto.fullName;
      existing.mobileE164 = dto.mobileE164 ?? null;
      await this.partners.save(existing);
      this.logger.log(
        {
          event: 'partner.register.overwrite',
          id: existing.id,
          email: existing.email,
          ip: ctx.ip,
        },
        'Auth',
      );
      const issued = await this.ensureEmailVerification(
        existing.id,
        existing.email,
        OtpPurpose.SIGNUP,
      );
      return this.otpResponse(issued);
    }
    const partner = await this.partners.save(
      this.partners.create({
        email: dto.email,
        passwordHash: await this.passwords.hash(dto.password),
        fullName: dto.fullName,
        mobileE164: dto.mobileE164 ?? null,
        status: ReferralPartnerStatus.PENDING_VERIFICATION,
      }),
    );
    this.logger.log(
      {
        event: 'partner.register',
        id: partner.id,
        email: partner.email,
        ip: ctx.ip,
      },
      'Auth',
    );
    const issued = await this.startEmailVerification(
      partner.id,
      partner.email,
      OtpPurpose.SIGNUP,
    );
    return this.otpResponse(issued);
  }

  /** Public resend for partner signup codes — token is the capability. */
  async resendSignupOtp(dto: ResendOtpDto): Promise<OtpIssueResponse> {
    const row = await this.otp.findByToken(dto.verificationToken);
    if (
      !row ||
      row.subjectType !== AuthSubject.REFERRAL ||
      row.purpose !== OtpPurpose.SIGNUP
    ) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    const partner = await this.findById(row.subjectId);
    if (!partner) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    if (partner.emailVerified) {
      throw new AppException(
        {
          code: 'EMAIL_ALREADY_VERIFIED',
          message: 'This email is already verified',
        },
        409,
      );
    }
    // Only a live pending registration may pump codes — e.g. a suspended
    // partner must not be able to re-activate itself via verify-otp.
    if (partner.status !== ReferralPartnerStatus.PENDING_VERIFICATION) {
      throw new AppException(
        { code: 'OTP_INVALID', message: 'Invalid verification token' },
        400,
      );
    }
    const issued = await this.resendEmailVerification(
      partner.id,
      partner.email,
      OtpPurpose.SIGNUP,
    );
    this.logger.log({ event: 'partner.otp.resent', id: partner.id }, 'Auth');
    return this.otpResponse(issued);
  }

  private otpResponse(issued: {
    verificationToken: string;
    code?: string;
    expiresInSec?: number;
    resendCooldownSec?: number;
  }): OtpIssueResponse {
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return presentOtpIssue(this.otp, issued, isProd);
  }

  async verifyOtp(
    dto: VerifyOtpDto,
    ctx: AuthContext,
  ): Promise<TokensWithPartner> {
    const partnerId = await this.completeEmailVerification(
      dto.verificationToken,
      dto.code,
      OtpPurpose.SIGNUP,
    );
    const partner = await this.partners.findOneOrFail({
      where: { id: partnerId },
    });
    partner.emailVerified = true;
    partner.status = ReferralPartnerStatus.ACTIVE;
    await this.partners.save(partner);
    const tokens = await this.issueTokens(partner, ctx);
    return { ...tokens, partner: presentPartner(partner) };
  }

  async login(dto: LoginDto, ctx: AuthContext): Promise<TokensWithPartner> {
    const { tokens, principal } = await this.authenticate(
      dto.email,
      dto.password,
      ctx,
    );
    return { ...tokens, partner: presentPartner(principal) };
  }

  // --- BaseAuthService hooks ---
  protected findByEmail(email: string): Promise<ReferralPartner | null> {
    return this.partners.findOne({ where: { email } });
  }
  protected findById(id: string): Promise<ReferralPartner | null> {
    return this.partners.findOne({ where: { id } });
  }
  protected getPasswordHash(p: ReferralPartner): string | null {
    return p.passwordHash;
  }
  protected isActive(p: ReferralPartner): boolean {
    return p.status === ReferralPartnerStatus.ACTIVE;
  }
  protected assertLoginable(p: ReferralPartner): void {
    if (p.status === ReferralPartnerStatus.PENDING_VERIFICATION) {
      throw new AppException(
        { code: 'PARTNER_NOT_VERIFIED', message: 'Verify your email first' },
        403,
      );
    }
    if (p.status === ReferralPartnerStatus.SUSPENDED) {
      throw new AppException(
        { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' },
        403,
      );
    }
  }
  protected signAccess(p: ReferralPartner, sid: string): string {
    const payload: ReferralJwtPayload = {
      sub: p.id,
      email: p.email,
      typ: 'referral',
      sid,
    };
    return this.jwt.sign(payload);
  }
  protected present(p: ReferralPartner): ReferralPartnerProfile {
    return presentPartner(p);
  }
  protected async onLogin(p: ReferralPartner): Promise<void> {
    p.lastLoginAt = new Date();
    await this.partners.save(p);
  }
}
