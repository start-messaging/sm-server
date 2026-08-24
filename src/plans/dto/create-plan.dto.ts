import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PlanStatus } from '../entities/plan.entity';
import type { PlanFeatures, PlanLimits } from '../entities/plan.entity';
import { IsPlanFeatures, IsPlanLimits } from './plan-records.validator';

export class CreatePlanDto {
  /**
   * Stable identifier ('FREE', 'BASIC', 'ADVANCED'…). IMMUTABLE after creation — plan
   * limits count existing workspaces by code, so renaming a code would
   * silently change what users are entitled to.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase().trim() : value,
  )
  @Matches(/^[A-Z][A-Z0-9_]{1,19}$/, {
    message:
      'code must be 2-20 chars: uppercase letters, digits and underscores',
  })
  code!: string;

  /**
   * Scope: a service key for a service-specific plan, omitted/null for a
   * global fallback row. Also immutable — re-scoping moves entitlements
   * between products.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  serviceKey?: string | null;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;

  /** Sort/upgrade order (FREE = 0). */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  tier?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  trialDays?: number;

  @IsOptional()
  @IsEnum(PlanStatus)
  status?: PlanStatus;

  @IsOptional()
  @IsPlanFeatures()
  features?: PlanFeatures;

  @IsOptional()
  @IsPlanLimits()
  limits?: PlanLimits;
}
