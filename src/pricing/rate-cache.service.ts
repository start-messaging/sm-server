import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import type { RateCellBase, RateCellRung } from './resolved-rate';

/** Safety-net TTL (seconds). Version invalidation is primary; this bounds drift. */
const CACHE_TTL_SECONDS = 600;

/** Cached country-base value — shared by ALL workspaces for the cell. */
export interface CachedBase extends RateCellBase {
  /** `ratever` at populate time; a mismatch with the current version = stale. */
  v: number;
}

/** Cached per-workspace ladder — only present for workspaces with an override. */
export interface CachedOvr {
  v: number;
  rungs: RateCellRung[];
}

/**
 * The Redis plumbing for rate resolution (docs §11.3) — pure key/value + the
 * version counter, no DB or pricing rules (those live in `RateResolverService`).
 *
 * Two layers so the cache stays small: the country base is shared across every
 * workspace (`rate:base:…`), and the per-workspace override (`rate:ovr:…`)
 * exists ONLY for the rare workspace that has one. Invalidation is by
 * VERSION, not DEL: any rate write `INCR`s `ratever:{service}:{country}`, and
 * every cached value carries the version it was written at — so a slow
 * read-through can't repopulate stale data (the lost-invalidation race), and a
 * single counter invalidates both layers for a (service, country) at once.
 */
@Injectable()
export class RateCacheService {
  constructor(private readonly redis: RedisService) {}

  private versionKey(serviceKey: string, cc: string): string {
    return `ratever:${serviceKey}:${cc}`;
  }
  private baseKey(serviceKey: string, cc: string, cat: string): string {
    return `rate:base:${serviceKey}:${cc}:${cat}`;
  }
  private ovrKey(
    workspaceId: string,
    serviceKey: string,
    cc: string,
    cat: string,
  ): string {
    return `rate:ovr:${workspaceId}:${serviceKey}:${cc}:${cat}`;
  }

  /** Current version for the cell's (service, country). Absent counter = 0. */
  async getVersion(serviceKey: string, cc: string): Promise<number> {
    const raw = await this.redis.get(this.versionKey(serviceKey, cc));
    return raw ? Number(raw) : 0;
  }

  /** Bump the version on any rate write — invalidates both cache layers. */
  async bumpVersion(serviceKey: string, cc: string): Promise<void> {
    await this.redis.raw.incr(this.versionKey(serviceKey, cc));
  }

  async readBase(
    serviceKey: string,
    cc: string,
    cat: string,
  ): Promise<CachedBase | null> {
    const raw = await this.redis.get(this.baseKey(serviceKey, cc, cat));
    return raw ? (JSON.parse(raw) as CachedBase) : null;
  }

  async writeBase(
    serviceKey: string,
    cc: string,
    cat: string,
    base: RateCellBase,
    version: number,
  ): Promise<void> {
    const value: CachedBase = { ...base, v: version };
    await this.redis.set(
      this.baseKey(serviceKey, cc, cat),
      JSON.stringify(value),
      CACHE_TTL_SECONDS,
    );
  }

  async readOvr(
    workspaceId: string,
    serviceKey: string,
    cc: string,
    cat: string,
  ): Promise<CachedOvr | null> {
    const raw = await this.redis.get(
      this.ovrKey(workspaceId, serviceKey, cc, cat),
    );
    return raw ? (JSON.parse(raw) as CachedOvr) : null;
  }

  async writeOvr(
    workspaceId: string,
    serviceKey: string,
    cc: string,
    cat: string,
    rungs: RateCellRung[],
    version: number,
  ): Promise<void> {
    const value: CachedOvr = { v: version, rungs };
    await this.redis.set(
      this.ovrKey(workspaceId, serviceKey, cc, cat),
      JSON.stringify(value),
      CACHE_TTL_SECONDS,
    );
  }
}
