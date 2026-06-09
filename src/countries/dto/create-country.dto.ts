import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

/** Create an ISO 3166-1 country. `code` is the primary key. */
export class CreateCountryDto {
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, { message: 'code must be a 2-letter ISO 3166-1 code' })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @Matches(/^\+\d{1,4}$/, { message: 'dialCode must look like +91' })
  dialCode!: string;

  @Transform(upper)
  @Matches(/^[A-Z]{3}$/, {
    message: 'currencyCode must be a 3-letter ISO 4217 code',
  })
  currencyCode!: string;
}
