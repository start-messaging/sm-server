import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_LADDER_RUNGS } from '../../workspaces/entities/workspace-service-rate.entity';
import { IsLadderRungs } from './ladder-rungs.validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

export class LadderRungDto {
  @IsInt()
  @Min(0)
  minQty!: number;

  @IsInt()
  @Min(0)
  sellMicros!: number;
}

/**
 * Replace one (country, category) cell's ladder WHOLESALE — the request always
 * carries the complete set of rungs (plans-PATCH precedent: merge would make
 * stale rungs undeletable). `currency` must equal the country's own currency
 * (cross-checked in the service → 422 `RATE_CURRENCY_MISMATCH`). Set-level
 * invariants (unique minQty, first rung 0) live in `IsLadderRungs`.
 */
export class PutLadderDto {
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currency must be a 3-letter ISO 4217 code',
  })
  currency!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LADDER_RUNGS)
  @ValidateNested({ each: true })
  @Type(() => LadderRungDto)
  @IsLadderRungs()
  rungs!: LadderRungDto[];
}
