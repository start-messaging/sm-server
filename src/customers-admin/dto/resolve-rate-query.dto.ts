import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/**
 * "What will this workspace pay?" — the inputs to a send-time resolution,
 * previewed by staff. `country` is the DESTINATION (Meta prices by destination),
 * `qty` is the monthly volume that selects the ladder rung (default 0 = the
 * flat/first rung).
 */
export class ResolveRateQueryDto {
  @IsString()
  @Length(2, 2)
  country!: string;

  @IsString()
  @Length(1, 40)
  category!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  qty: number = 0;
}
