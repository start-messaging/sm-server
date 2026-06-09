import { Country } from './entities/country.entity';

/** Public shape of a country returned by the API. */
export interface CountryProfile {
  code: string;
  name: string;
  dialCode: string;
  currencyCode: string;
  isActive: boolean;
}

export function presentCountry(c: Country): CountryProfile {
  return {
    code: c.code,
    name: c.name,
    dialCode: c.dialCode,
    currencyCode: c.currencyCode,
    isActive: c.isActive,
  };
}
