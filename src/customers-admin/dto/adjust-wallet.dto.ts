import {
  IsIn,
  IsInt,
  IsPositive,
  IsString,
  MaxLength,
  Max,
} from 'class-validator';

/** A manual, staff-initiated wallet movement (top-up or correction). */
export type AdjustDirection = 'credit' | 'debit';

/**
 * Manual wallet adjustment by finance staff. `amountMicros` is the positive
 * magnitude in the wallet's currency; `direction` decides credit vs debit. A
 * single manual amount stays well under 2^53 micros, so a plain int is safe
 * here (unlike the accumulating balance, which is a string end-to-end). The
 * `reason` is recorded on the ledger row's metadata for the audit trail.
 */
export class AdjustWalletDto {
  @IsIn(['credit', 'debit'])
  direction!: AdjustDirection;

  /** Micros (1 unit = 1,000,000). Positive; capped to a sane manual ceiling. */
  @IsInt()
  @IsPositive()
  @Max(1_000_000_000_000)
  amountMicros!: number;

  @IsString()
  @MaxLength(200)
  reason!: string;
}
