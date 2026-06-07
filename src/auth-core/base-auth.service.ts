import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { PasswordService } from '../security/password.service';
import { SessionStore } from '../sessions/session-store.service';
import { AuthSubject } from './auth-subject.enum';
import type { AuthContext, TokenPair } from './auth.types';

/**
 * Reusable auth flow shared by every actor (customer / staff / referral).
 * Concrete services implement the per-actor hooks; login/refresh/logout/me and
 * token issuance are inherited. Refresh tokens + active sessions live in Redis
 * (via `SessionStore`), so logout is instant.
 */
export abstract class BaseAuthService<
  P extends { id: string; email: string },
  Profile,
> {
  protected constructor(
    protected readonly sessions: SessionStore,
    protected readonly passwords: PasswordService,
    protected readonly logger: AppLogger,
  ) {}

  protected abstract readonly subject: AuthSubject;
  protected abstract findByEmail(email: string): Promise<P | null>;
  protected abstract findById(id: string): Promise<P | null>;
  protected abstract getPasswordHash(principal: P): string | null;
  protected abstract isActive(principal: P): boolean;
  /** Throw an AppException if this principal must not log in (pending/suspended). */
  protected abstract assertLoginable(principal: P): void;
  protected abstract signAccess(principal: P, sid: string): string;
  protected abstract present(principal: P): Profile;
  protected abstract onLogin(principal: P): Promise<void>;

  async me(id: string): Promise<Profile> {
    const principal = await this.findById(id);
    if (!principal) {
      throw new AppException({ code: 'NOT_FOUND', message: 'Not found' }, 404);
    }
    return this.present(principal);
  }

  async logout(sid: string): Promise<void> {
    await this.sessions.revoke(sid);
  }

  async refresh(refreshToken: string, ctx: AuthContext): Promise<TokenPair> {
    const rotated = await this.sessions.rotate(refreshToken, this.subject, ctx);
    const principal = await this.findById(rotated.subjectId);
    if (!principal || !this.isActive(principal)) {
      await this.sessions.revoke(rotated.sid);
      throw new AppException(
        { code: 'SESSION_INVALID', message: 'Invalid or expired session' },
        401,
      );
    }
    this.logger.log(
      { event: 'auth.refresh', subject: this.subject, id: principal.id },
      'Auth',
    );
    return {
      accessToken: this.signAccess(principal, rotated.sid),
      refreshToken: rotated.refreshToken,
    };
  }

  /** Verify credentials and issue a session. Returns the principal for presenting. */
  protected async authenticate(
    email: string,
    password: string,
    ctx: AuthContext,
  ): Promise<{ tokens: TokenPair; principal: P }> {
    const principal = await this.findByEmail(email);
    const hash = principal ? this.getPasswordHash(principal) : null;
    if (!principal || !hash || !(await this.passwords.verify(hash, password))) {
      this.logger.warn(
        {
          event: 'auth.login.failed',
          subject: this.subject,
          email,
          ip: ctx.ip,
        },
        'Auth',
      );
      throw new AppException(
        { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        401,
      );
    }
    this.assertLoginable(principal);
    await this.onLogin(principal);
    const tokens = await this.issueTokens(principal, ctx);
    this.logger.log(
      {
        event: 'auth.login.success',
        subject: this.subject,
        id: principal.id,
        ip: ctx.ip,
      },
      'Auth',
    );
    return { tokens, principal };
  }

  protected async issueTokens(
    principal: P,
    ctx: AuthContext,
  ): Promise<TokenPair> {
    const { sid, refreshToken } = await this.sessions.issue(
      this.subject,
      principal.id,
      ctx,
    );
    return { accessToken: this.signAccess(principal, sid), refreshToken };
  }
}
