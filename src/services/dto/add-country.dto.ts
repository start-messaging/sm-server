import { Transform } from 'class-transformer';
import { Matches } from 'class-validator';

const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toUpperCase().trim() : value;

/** Add a country to a service: seeds one unpriced rate row per category. */
export class AddCountryDto {
  @Transform(upper)
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryCode must be a 2-letter ISO 3166-1 code',
  })
  countryCode!: string;
}
