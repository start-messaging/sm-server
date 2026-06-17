import type { ServiceCountryRate } from '../services/entities/service-country-rate.entity';
import type { Service } from '../services/entities/service.entity';
import type { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import type { Workspace } from '../workspaces/entities/workspace.entity';

export interface LadderRungProfile {
  minQty: number;
  sellMicros: number;
}

/**
 * One (category) cell within a country group: the country BASE rate (what the
 * cell inherits — null when the base row is missing/unpriced for this country)
 * plus this workspace's LADDER (empty array = inherits base). Margin per rung
 * is derived in the UI from `base.providerCostMicros` — rungs deliberately
 * carry no cost copy.
 */
export interface WorkspaceRateCellProfile {
  categoryKey: string;
  base: {
    providerCostMicros: number | null;
    sellMicros: number | null;
    isActive: boolean;
  } | null;
  ladder: LadderRungProfile[];
}

export interface WorkspaceCountryRatesProfile {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
  /** The workspace's own (locked) country — listed first in the UI. */
  isHome: boolean;
  cells: WorkspaceRateCellProfile[];
}

/** The grouped view returned by GET /admin/workspaces/:id/services/:key/rates. */
export interface WorkspaceRatesView {
  workspace: {
    id: string;
    name: string;
    countryCode: string;
    defaultCurrency: string;
  };
  service: {
    key: string;
    name: string;
    categories: { key: string; label: string }[];
  };
  countries: WorkspaceCountryRatesProfile[];
}

interface CountryMeta {
  countryCode: string;
  countryName: string;
  currency: string;
  currencySymbol: string;
  currencyDecimalPlaces: number;
}

function metaFromBase(r: ServiceCountryRate): CountryMeta {
  return {
    countryCode: r.countryCode,
    countryName: r.country?.name ?? r.countryCode,
    currency: r.currency,
    currencySymbol: r.currencyRef?.symbol ?? r.currency,
    currencyDecimalPlaces: r.currencyRef?.decimalPlaces ?? 2,
  };
}

function metaFromLadder(r: WorkspaceServiceRate): CountryMeta {
  return {
    countryCode: r.countryCode,
    countryName: r.country?.name ?? r.countryCode,
    currency: r.currency,
    currencySymbol: r.currencyRef?.symbol ?? r.currency,
    currencyDecimalPlaces: r.currencyRef?.decimalPlaces ?? 2,
  };
}

/**
 * Merge the service's country BASE rows with this workspace's ladder rows into
 * one per-country view (union of countries: base-priced + any stray
 * ladder-only country). Every country group carries a cell for EVERY service
 * category (base null / ladder [] when absent) so the UI never special-cases a
 * missing cell. Stale categories (removed from the service) are skipped, like
 * the base rate view. Home country first, then by code.
 */
export function buildWorkspaceRatesView(
  workspace: Workspace,
  service: Service,
  baseRows: ServiceCountryRate[],
  ladderRows: WorkspaceServiceRate[],
): WorkspaceRatesView {
  const categories = [...(service.categories ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
  );
  const known = new Set(categories.map((c) => c.key));

  const metas = new Map<string, CountryMeta>();
  const baseByCell = new Map<string, ServiceCountryRate>();
  for (const r of baseRows) {
    if (!known.has(r.categoryKey)) continue; // stale category → skip
    if (!metas.has(r.countryCode)) metas.set(r.countryCode, metaFromBase(r));
    baseByCell.set(`${r.countryCode}:${r.categoryKey}`, r);
  }
  const ladderByCell = new Map<string, LadderRungProfile[]>();
  for (const r of ladderRows) {
    if (!known.has(r.categoryKey)) continue;
    if (!metas.has(r.countryCode)) metas.set(r.countryCode, metaFromLadder(r));
    const cell = `${r.countryCode}:${r.categoryKey}`;
    const rungs = ladderByCell.get(cell) ?? [];
    rungs.push({ minQty: r.minQty, sellMicros: r.sellMicros });
    ladderByCell.set(cell, rungs);
  }
  for (const rungs of ladderByCell.values()) {
    rungs.sort((a, b) => a.minQty - b.minQty);
  }

  const countries = [...metas.values()]
    .map((meta) => ({
      ...meta,
      isHome: meta.countryCode === workspace.countryCode,
      cells: categories.map((c) => {
        const cell = `${meta.countryCode}:${c.key}`;
        const base = baseByCell.get(cell);
        return {
          categoryKey: c.key,
          base: base
            ? {
                providerCostMicros: base.providerCostMicros,
                sellMicros: base.sellMicros,
                isActive: base.isActive,
              }
            : null,
          ladder: ladderByCell.get(cell) ?? [],
        };
      }),
    }))
    .sort(
      (a, b) =>
        Number(b.isHome) - Number(a.isHome) ||
        a.countryCode.localeCompare(b.countryCode),
    );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      countryCode: workspace.countryCode,
      defaultCurrency: workspace.defaultCurrency,
    },
    service: {
      key: service.key,
      name: service.name,
      categories: categories.map((c) => ({ key: c.key, label: c.label })),
    },
    countries,
  };
}
