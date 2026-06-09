import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

/** Update a country. `code` is immutable (it's the key); deactivate, don't delete. */
export class UpdateCountryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Matches(/^\+\d{1,4}$/, { message: 'dialCode must look like +91' })
  dialCode?: string;

  @IsOptional()
  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currencyCode must be a 3-letter ISO 4217 code',
  })
  currencyCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
