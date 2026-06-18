import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { ServiceCountryRate } from '../services/entities/service-country-rate.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { RateCacheService } from './rate-cache.service';
import {
  pickRung,
  type RateCell,
  type RateQuery,
  type ResolvedRate,
} from './resolved-rate';

/**
 * The two-tier rate resolver (docs §11). Strictly two tiers — workspace ladder
 * rung → country base — no global, no plan tier. Rules:
 *  - The country base is REQUIRED: absent / inactive / unpriced → a hard
 *    `RATE_NOT_CONFIGURED` (never a silent free send). It is the sole source of
 *    `costMicros` (operator-wide cost) and the resolved `currency`.
 *  - A workspace override participates only via its ACTIVE rungs; the rung
 *    with the largest `minQty <= qty` overrides `sellMicros` (tier 1). If the
 *    cell has no active rung covering `qty`, resolution falls through to the
 *    base (tier 2) — a fully-inactive override never blocks the base.
 *
 * The hot path (`resolve`) is an O(1) Redis read backed by `RateCacheService`;
 * the cold SQL runs only on a miss/stale version. `resolveCold` is the
 * cache-free path (tests, diagnostics, and the miss branch).
 */
@Injectable()
export class RateResolverService {
  constructor(
    @InjectRepository(ServiceCountryRate)
    private readonly baseRates: Repository<ServiceCountryRate>,
    @InjectRepository(WorkspaceServiceRate)
    private readonly ladders: Repository<WorkspaceServiceRate>,
    private readonly cache: RateCacheService,
  ) {}

  /** Cached resolution — the send-path entry point. */
  async resolve(query: RateQuery): Promise<ResolvedRate> {
    const cc = query.countryCode.toUpperCase();
    const { serviceKey, categoryKey, workspaceId } = query;
    const qty = Math.max(0, Math.floor(query.qty || 0));
    const version = await this.cache.getVersion(serviceKey, cc);

    const [cachedBase, cachedOvr] = await Promise.all([
      this.cache.readBase(serviceKey, cc, categoryKey),
      this.cache.readOvr(workspaceId, serviceKey, cc, categoryKey),
    ]);

    // A FRESH base means a cold resolve ran at this version and would have
    // populated `ovr` if an override existed — so a fresh base lets us trust an
    // ovr miss as "no override". A stale/absent base forces the cold path.
    if (cachedBase && cachedBase.v === version) {
      const rungs = cachedOvr && cachedOvr.v === version ? cachedOvr.rungs : [];
      return this.resolveCell({ base: { ...cachedBase }, rungs }, qty, query);
    }

    // Cold miss: read the cell, apply the rules, repopulate both layers.
    const cell = await this.loadCell(query);
    const resolved = this.resolveCell(cell, qty, query);
    if (cell.base) {
      await this.cache.writeBase(
        serviceKey,
        cc,
        categoryKey,
        cell.base,
        version,
      );
      if (cell.rungs.length > 0) {
        await this.cache.writeOvr(
          workspaceId,
          serviceKey,
          cc,
          categoryKey,
          cell.rungs,
          version,
        );
      }
    }
    return resolved;
  }

  /** Cache-free resolution straight from Postgres. */
  async resolveCold(query: RateQuery): Promise<ResolvedRate> {
    const cell = await this.loadCell(query);
    return this.resolveCell(
      cell,
      Math.max(0, Math.floor(query.qty || 0)),
      query,
    );
  }

  /** Invalidate a cell's (service, country) — called by every rate write. */
  invalidate(serviceKey: string, countryCode: string): Promise<void> {
    return this.cache.bumpVersion(serviceKey, countryCode.toUpperCase());
  }

  /* ------------------------------ internals ----------------------------- */

  /** Load the raw cell: the country base row + the workspace's active rungs. */
  private async loadCell(query: RateQuery): Promise<RateCell> {
    const cc = query.countryCode.toUpperCase();
    const [base, rungRows] = await Promise.all([
      this.baseRates.findOne({
        where: {
          serviceKey: query.serviceKey,
          countryCode: cc,
          categoryKey: query.categoryKey,
        },
      }),
      this.ladders.find({
        where: {
          workspaceId: query.workspaceId,
          serviceKey: query.serviceKey,
          countryCode: cc,
          categoryKey: query.categoryKey,
          isActive: true,
        },
        order: { minQty: 'ASC' },
      }),
    ]);

    // The base is unusable unless active AND priced (0 is a legal free price).
    const usableBase =
      base && base.isActive && base.sellMicros !== null
        ? {
            costMicros: base.providerCostMicros,
            sellMicros: base.sellMicros,
            currency: base.currency,
          }
        : null;

    return {
      base: usableBase,
      rungs: rungRows.map((r) => ({
        minQty: r.minQty,
        sellMicros: r.sellMicros,
      })),
    };
  }

  /** Apply the two-tier rules to an already-loaded cell. */
  private resolveCell(
    cell: RateCell,
    qty: number,
    query: RateQuery,
  ): ResolvedRate {
    if (!cell.base) {
      throw new AppException(
        {
          code: 'RATE_NOT_CONFIGURED',
          message: 'No active country rate for this destination',
          details: {
            serviceKey: query.serviceKey,
            countryCode: query.countryCode.toUpperCase(),
            categoryKey: query.categoryKey,
          },
        },
        422,
      );
    }

    const rung = pickRung(cell.rungs, qty);
    if (rung) {
      return {
        sellMicros: rung.sellMicros,
        costMicros: cell.base.costMicros,
        currency: cell.base.currency,
        tier: 1,
        minQty: rung.minQty,
      };
    }
    return {
      sellMicros: cell.base.sellMicros,
      costMicros: cell.base.costMicros,
      currency: cell.base.currency,
      tier: 2,
      minQty: null,
    };
  }
}
