import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Update a currency. `code` is immutable (it's the key); deactivate, don't delete. */
export class UpdateCurrencyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  symbol?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimalPlaces?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
