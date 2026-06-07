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
const refreshKey = (hash: string): string => `refresh:${hash}`;
const subjectKey = (t: AuthSubject, id: string): string => `subject:${t}:${id}`;

/**
 * Redis-backed sessions. The access JWT carries a `sid`; the auth guards check
 * `sess:{sid}` on every request, so revoking a session logs the user out
 * instantly (not just at refresh time). Refresh tokens are opaque and stored
 * only as a SHA-256 hash.
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

  async issue(
    subjectType: AuthSubject,
    subjectId: string,
    ctx: AuthContext = {},
  ): Promise<IssuedSession> {
    const sid = this.hash.randomToken(16);
    const refreshToken = this.hash.randomToken(32);
    const refreshHash = this.hash.sha256(refreshToken);
    const ttl = this.ttlSeconds();
    const record: SessionRecord = {
      subjectType,
      subjectId,
      refreshHash,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.redis.set(sessKey(sid), JSON.stringify(record), ttl);
    await this.redis.set(refreshKey(refreshHash), sid, ttl);
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
    const oldHash = this.hash.sha256(refreshToken);
    const sid = await this.redis.get(refreshKey(oldHash));
    if (!sid) throw this.invalid();
    const raw = await this.redis.get(sessKey(sid));
    if (!raw) throw this.invalid();
    const record = JSON.parse(raw) as SessionRecord;
    if (record.subjectType !== expectedSubject) throw this.invalid();

    const newToken = this.hash.randomToken(32);
    const newHash = this.hash.sha256(newToken);
    const ttl = this.ttlSeconds();
    record.refreshHash = newHash;
    if (ctx.ip) record.ip = ctx.ip;
    if (ctx.userAgent) record.userAgent = ctx.userAgent;
    await this.redis.del(refreshKey(oldHash));
    await this.redis.set(refreshKey(newHash), sid, ttl);
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
    await this.redis.del(sessKey(sid), refreshKey(record.refreshHash));
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
