import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { EnvVars } from '../config/env.validation';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import type { AuthContext } from '../auth-core/auth.types';
import { HashService } from '../security/hash.service';
import { RedisService } from '../redis/redis.service';

interface SessionRecord {
  subjectType: AuthSubject;
  subjectId: string;
  refreshHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface IssuedSession {
  sid: string;
  refreshToken: string;
}

export interface RotatedSession {
  sid: string;
  subjectType: AuthSubject;
  subjectId: string;
  refreshToken: string;
}

const sessKey = (sid: string): string => `sess:${sid}`;
const subjectKey = (t: AuthSubject, id: string): string => `subject:${t}:${id}`;

/**
 * Redis-backed sessions. The access JWT carries a `sid`; the auth guards check
 * `sess:{sid}` on every request, so revoking a session logs the user out
 * instantly (not just at refresh time).
 *
 * The refresh token is `${sid}.${secret}` — it carries its own session id, so a
 * replayed (already-rotated) token is still traceable to its session and we can
 * detect reuse. Only the SHA-256 hash of the *current* token is stored, on the
 * session record itself; there is no separate refresh→sid index.
 */
@Injectable()
export class SessionStore {
  constructor(
    private readonly redis: RedisService,
    private readonly hash: HashService,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  private ttlSeconds(): number {
    return this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true }) * 86_400;
  }

  /** Refresh token format: `${sid}.${secret}` — self-identifying for reuse detection. */
  private makeRefreshToken(sid: string): string {
    return `${sid}.${this.hash.randomToken(32)}`;
  }

  /** Extract the session id from a `${sid}.${secret}` refresh token, or null. */
  private sidFromRefreshToken(token: string): string | null {
    const dot = token.indexOf('.');
    if (dot <= 0 || dot === token.length - 1) return null;
    return token.slice(0, dot);
  }

  async issue(
    subjectType: AuthSubject,
    subjectId: string,
    ctx: AuthContext = {},
  ): Promise<IssuedSession> {
    const sid = this.hash.randomToken(16);
    const refreshToken = this.makeRefreshToken(sid);
    const ttl = this.ttlSeconds();
    const record: SessionRecord = {
      subjectType,
      subjectId,
      refreshHash: this.hash.sha256(refreshToken),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(sessKey(sid), JSON.stringify(record), ttl);
    await this.redis.sadd(subjectKey(subjectType, subjectId), sid);
    await this.redis.expire(subjectKey(subjectType, subjectId), ttl);
    this.logger.log(
      { event: 'session.issued', subjectType, subjectId, sid },
      'SessionStore',
    );
    return { sid, refreshToken };
  }

  /** Used by the auth guards to enforce instant logout. */
  exists(sid: string): Promise<boolean> {
    return this.redis.exists(sessKey(sid));
  }

  async rotate(
    refreshToken: string,
    expectedSubject: AuthSubject,
    ctx: AuthContext = {},
  ): Promise<RotatedSession> {
    const sid = this.sidFromRefreshToken(refreshToken);
    if (!sid) throw this.invalid();
    const raw = await this.redis.get(sessKey(sid));
    if (!raw) throw this.invalid();
    const record = JSON.parse(raw) as SessionRecord;
    if (record.subjectType !== expectedSubject) throw this.invalid();

    // Reuse detection: the session is alive but this is NOT its current refresh
    // token → a consumed (already-rotated) token is being replayed. Treat it as
    // theft and revoke the whole session, so neither the attacker nor the victim
    // can keep refreshing. (See [decisions.md] refresh-token rotation + reuse.)
    if (this.hash.sha256(refreshToken) !== record.refreshHash) {
      this.logger.warn(
        {
          event: 'session.refresh.reuse',
          subjectType: record.subjectType,
          subjectId: record.subjectId,
          sid,
          ip: ctx.ip,
        },
        'SessionStore',
      );
      await this.revoke(sid);
      throw this.invalid();
    }

    const newToken = this.makeRefreshToken(sid);
    const ttl = this.ttlSeconds();
    record.refreshHash = this.hash.sha256(newToken);
    if (ctx.ip) record.ip = ctx.ip;
    if (ctx.userAgent) record.userAgent = ctx.userAgent;
    await this.redis.set(sessKey(sid), JSON.stringify(record), ttl);
    await this.redis.expire(
      subjectKey(record.subjectType, record.subjectId),
      ttl,
    );
    return {
      sid,
      subjectType: record.subjectType,
      subjectId: record.subjectId,
      refreshToken: newToken,
    };
  }

  async revoke(sid: string): Promise<void> {
    const raw = await this.redis.get(sessKey(sid));
    if (!raw) return;
    const record = JSON.parse(raw) as SessionRecord;
    await this.redis.del(sessKey(sid));
    await this.redis.srem(
      subjectKey(record.subjectType, record.subjectId),
      sid,
    );
    this.logger.log(
      {
        event: 'session.revoked',
        subjectType: record.subjectType,
        subjectId: record.subjectId,
        sid,
      },
      'SessionStore',
    );
  }

  async revokeAllForSubject(
    subjectType: AuthSubject,
    subjectId: string,
  ): Promise<void> {
    const sids = await this.redis.smembers(subjectKey(subjectType, subjectId));
    for (const sid of sids) {
      await this.revoke(sid);
    }
    await this.redis.del(subjectKey(subjectType, subjectId));
  }

  private invalid(): AppException {
    return new AppException(
      { code: 'SESSION_INVALID', message: 'Invalid or expired session' },
      401,
    );
  }
}
