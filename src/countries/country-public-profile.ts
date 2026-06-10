import { Country } from './entities/country.entity';

/** Lean customer-facing country shape — just what a phone picker needs. */
export interface CountryPublicProfile {
  code: string;
  name: string;
  dialCode: string;
}

export function presentPublicCountry(c: Country): CountryPublicProfile {
  return { code: c.code, name: c.name, dialCode: c.dialCode };
}
