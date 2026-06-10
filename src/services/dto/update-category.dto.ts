import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Edit a service category. `key` is immutable (its identity within the service). */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  hint?: string;
}
