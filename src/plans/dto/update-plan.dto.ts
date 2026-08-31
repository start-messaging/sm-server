import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PlanStatus } from '../entities/plan.entity';
import type { PlanFeatures, PlanLimits } from '../entities/plan.entity';
import { IsPlanFeatures, IsPlanLimits } from './plan-records.validator';

/**
 * `code` and `serviceKey` are deliberately absent — plan identity is immutable
 * (see CreatePlanDto). `features`/`limits` REPLACE the stored record wholesale:
 * the admin form always submits the complete set, so merge semantics would only
 * make stale keys undeletable.
 */
export class UpdatePlanDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

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

  @IsOptional()
  roleGates?: Record<string, string>;
}
