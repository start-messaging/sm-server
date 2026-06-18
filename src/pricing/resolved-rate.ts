/**
 * The send-time question (docs §11): for THIS workspace, sending THIS service
 * to THIS destination country in THIS category — at THIS monthly volume — what
 * do we charge? `qty` is the workspace's running monthly volume for the cell;
 * it selects the ladder rung. It is an input here (the caller owns volume
 * tracking, which lands with messaging in Phase 6); pass 0 for a flat lookup.
 */
export interface RateQuery {
  workspaceId: string;
  serviceKey: string;
  countryCode: string;
  categoryKey: string;
  qty: number;
}

/**
 * The resolved price. One winning row supplies `sellMicros`; `costMicros`
 * ALWAYS comes from the country base (operator-wide cost — the override moves
 * only sell, per decisions.md). `tier` records who won: 1 = a workspace ladder
 * rung, 2 = the country base. Currency must equal the wallet currency (no FX).
 */
export interface ResolvedRate {
  sellMicros: number;
  costMicros: number | null;
  currency: string;
  tier: 1 | 2;
  /** The matched rung's threshold when `tier === 1`, else null. */
  minQty: number | null;
}

/** Raw cell data — the country base row plus the workspace's active rungs. */
export interface RateCellBase {
  costMicros: number | null;
  sellMicros: number;
  currency: string;
}

export interface RateCellRung {
  minQty: number;
  sellMicros: number;
}

export interface RateCell {
  base: RateCellBase | null;
  rungs: RateCellRung[];
}

/**
 * Pick the workspace rung that applies at `qty`: the largest `minQty <= qty`.
 * Rungs must be sorted ascending. Returns null when no active rung covers
 * `qty` (then resolution falls through to the country base).
 */
export function pickRung(
  rungs: RateCellRung[],
  qty: number,
): RateCellRung | null {
  let chosen: RateCellRung | null = null;
  for (const rung of rungs) {
    if (rung.minQty <= qty) chosen = rung;
    else break;
  }
  return chosen;
}
