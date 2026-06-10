import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { JwtPayload } from './types/jwt-payload';
import { presentUser, type UserProfile } from './user-profile';

export interface AuthTokensWithUser extends TokenPair {
  user: UserProfile;
}

@Injectable()
export class AuthService extends EmailAuthService<User, UserProfile> {
  protected readonly subject = AuthSubject.USER;

  constructor(
    sessions: SessionStore,
    passwords: PasswordService,
    logger: AppLogger,
    otp: OtpService,
    mailer: MailerService,
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvVars, true>,
  ) {
    super(sessions, passwords, logger, otp, mailer);
  }

  async signup(dto: SignupDto, ctx: AuthContext): Promise<OtpIssueResponse> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      // A verified (or suspended) account is genuinely taken. An unverified
      // one is only a CLAIM on the email — nobody proved ownership yet — so a
      // repeat signup resumes it: overwrite the claimed name/password and
      // re-run verification. The emailed code still gates activation.
      if (
        existing.emailVerified ||
        existing.status !== UserStatus.PENDING_VERIFICATION
      ) {
        throw new AppException(
          { code: 'EMAIL_TAKEN', message: 'Email already registered' },
          409,
        );
      }
      const passwordHash = await this.passwords.hash(dto.password);
      await this.users.overwritePending(existing.id, {
        passwordHash,
        fullName: dto.fullName,
      });
      this.logger.log(
        {
          event: 'user.signup.overwrite',
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
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.createPending({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });
    this.logger.log(
      { event: 'user.signup', id: user.id, email: user.email, ip: ctx.ip },
      'Auth',
    );
    const issued = await this.startEmailVerification(
      user.id,
      user.email,
      OtpPurpose.SIGNUP,
    );
    return this.otpResponse(issued);
  }

  async verifyOtp(
    dto: VerifyOtpDto,
    ctx: AuthContext,
  ): Promise<AuthTokensWithUser> {
    const userId = await this.completeEmailVerification(
      dto.verificationToken,
      dto.code,
      OtpPurpose.SIGNUP,
    );
    const user = await this.users.markVerified(userId);
    const tokens = await this.issueTokens(user, ctx);
    return { ...tokens, user: presentUser(user) };
  }

  async login(dto: LoginDto, ctx: AuthContext): Promise<AuthTokensWithUser> {
    try {
      const { tokens, principal } = await this.authenticate(
        dto.email,
        dto.password,
        ctx,
      );
      return { ...tokens, user: presentUser(principal) };
    } catch (err) {
      // Correct password but unverified email (assertLoginable runs AFTER the
      // credential check, so this never fires for a wrong password): attach a
      // verification token so the client can resume the email-OTP step instead
      // of dead-ending. Everything else passes through untouched.
      if (this.isUserNotVerified(err)) {
        const user = await this.users.findByEmail(dto.email);
        if (user) {
          let issued;
          try {
            issued = await this.ensureEmailVerification(
              user.id,
              user.email,
              OtpPurpose.SIGNUP,
            );
          } catch {
            // Residual cooldown edge (no usable open code yet a recent row
            // holds the clock): degrade to the plain 403 instead of turning a
            // login into a 429 — the user can still resume via signup.
            throw err;
          }
          throw new AppException(
            {
              code: 'USER_NOT_VERIFIED',
              message: 'Verify your email first',
              details: { email: user.email, ...this.otpResponse(issued) },
            },
            403,
          );
        }
      }
      throw err;
    }
  }

  private isUserNotVerified(err: unknown): boolean {
    return (
      err instanceof AppException &&
      (err.getResponse() as { code?: string }).code === 'USER_NOT_VERIFIED'
    );
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

  // --- BaseAuthService hooks ---
  protected findByEmail(email: string): Promise<User | null> {
    return this.users.findByEmail(email);
  }
  protected findById(id: string): Promise<User | null> {
    return this.users.findById(id);
  }
  protected getPasswordHash(u: User): string | null {
    return u.passwordHash;
  }
  protected isActive(u: User): boolean {
    return u.status === UserStatus.ACTIVE;
  }
  protected assertLoginable(u: User): void {
    if (u.status === UserStatus.PENDING_VERIFICATION) {
      throw new AppException(
        { code: 'USER_NOT_VERIFIED', message: 'Verify your email first' },
        403,
      );
    }
    if (u.status === UserStatus.SUSPENDED) {
      throw new AppException(
        { code: 'ACCOUNT_SUSPENDED', message: 'Account suspended' },
        403,
      );
    }
  }
  protected signAccess(u: User, sid: string): string {
    const payload: JwtPayload = { sub: u.id, email: u.email, typ: 'user', sid };
    return this.jwt.sign(payload);
  }
  protected present(u: User): UserProfile {
    return presentUser(u);
  }
  protected async onLogin(u: User): Promise<void> {
    await this.users.touchLastLogin(u.id);
  }
}
