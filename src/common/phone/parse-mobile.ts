import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { AppException } from '../exceptions/app.exception';

export interface ParsedMobile {
  /** Canonical E.164 (libphonenumber's normalisation, not the raw input). */
  e164: string;
  /** ISO 3166-1 alpha-2 derived from the number, e.g. `IN`, `US`. */
  countryCode: string;
}

/**
 * Parse and validate a mobile number, deriving its country. Uses the `/max`
 * metadata so shared calling codes resolve correctly (+1 → US vs CA) — never
 * derive a country from `countries.dialCode`, it is not unique.
 */
export function parseMobileOrThrow(raw: string): ParsedMobile {
  const parsed = parsePhoneNumberFromString(raw);
  if (!parsed || !parsed.isValid()) {
    throw new AppException(
      { code: 'MOBILE_INVALID', message: 'Not a valid phone number' },
      400,
    );
  }
  if (!parsed.country) {
    // Valid but non-geographic (e.g. +870 satellite) — no country to derive.
    throw new AppException(
      {
        code: 'MOBILE_COUNTRY_UNRESOLVED',
        message: 'Could not determine the country for this number',
      },
      400,
    );
  }
  return { e164: parsed.number, countryCode: parsed.country };
}
