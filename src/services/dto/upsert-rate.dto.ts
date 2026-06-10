import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Matches, Min } from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

/**
 * Upsert one (country, category) rate cell. `currency` must equal the country's
 * own currency (cross-checked in the service → 422 `RATE_CURRENCY_MISMATCH`).
 * `null` on a micros field clears it back to "unpriced"; omitting it leaves the
 * stored value untouched on update.
 */
export class UpsertRateDto {
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code',
  })
  currency!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  providerCostMicros?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sellMicros?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
