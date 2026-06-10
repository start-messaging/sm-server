import { ValueTransformer } from 'typeorm';

/**
 * TypeORM maps Postgres `bigint` to a JS **string** (to avoid silent precision
 * loss above 2^53). For money stored as integer **micros** (1 unit = 1,000,000)
 * the values sit far below 2^53 for any realistic per-message price, so reading
 * them back as `number` is safe and keeps API payloads numeric.
 *
 * Do NOT reuse this for high-magnitude money (e.g. wallet balances) — keep those
 * as `string` end-to-end.
 */
export const bigintTransformer: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};
