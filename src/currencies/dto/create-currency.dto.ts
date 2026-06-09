import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

/** Create an ISO 4217 currency. `code` is the primary key. */
export class CreateCurrencyDto {
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, { message: 'code must be a 3-letter ISO 4217 code' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8)
  symbol!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(4)
  decimalPlaces?: number;
}
