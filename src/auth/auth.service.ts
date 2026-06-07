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

  async signup(
    dto: SignupDto,
    ctx: AuthContext,
  ): Promise<{ verificationToken: string; devCode?: string }> {
    const existing = await this.users.findByEmail(dto.email);
    if (existing) {
      throw new AppException(
        { code: 'EMAIL_TAKEN', message: 'Email already registered' },
        409,
      );
    }
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.users.createPending({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      mobileE164: dto.mobileE164,
      countryCode: dto.countryCode,
    });
    this.logger.log(
      { event: 'user.signup', id: user.id, email: user.email, ip: ctx.ip },
      'Auth',
    );
    const { verificationToken, code } = await this.startEmailVerification(
      user.id,
      user.email,
      OtpPurpose.SIGNUP,
    );
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return { verificationToken, ...(isProd ? {} : { devCode: code }) };
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
    const { tokens, principal } = await this.authenticate(
      dto.email,
      dto.password,
      ctx,
    );
    return { ...tokens, user: presentUser(principal) };
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
