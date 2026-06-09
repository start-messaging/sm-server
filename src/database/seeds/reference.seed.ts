import dataSource from '../data-source';
import { Country } from '../../countries/entities/country.entity';
import { Currency } from '../../currencies/entities/currency.entity';

/**
 * Base reference data. A curated starter set — extend by appending rows (the
 * full ISO lists can be dropped in later, or added via the admin UI). Seeding
 * is idempotent and non-destructive: `ON CONFLICT DO NOTHING` inserts only the
 * rows that are missing, so re-running never clobbers admin edits.
 */
const CURRENCIES: Array<Partial<Currency>> = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0 },
];

// `dialCode` is intentionally non-unique: US and CA both use +1 — country
// derivation from a number must use libphonenumber, not this column.
const COUNTRIES: Array<Partial<Country>> = [
  { code: 'IN', name: 'India', dialCode: '+91', currencyCode: 'INR' },
  { code: 'US', name: 'United States', dialCode: '+1', currencyCode: 'USD' },
  { code: 'CA', name: 'Canada', dialCode: '+1', currencyCode: 'CAD' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', currencyCode: 'GBP' },
  {
    code: 'AE',
    name: 'United Arab Emirates',
    dialCode: '+971',
    currencyCode: 'AED',
  },
  { code: 'SG', name: 'Singapore', dialCode: '+65', currencyCode: 'SGD' },
  { code: 'AU', name: 'Australia', dialCode: '+61', currencyCode: 'AUD' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', currencyCode: 'SAR' },
  { code: 'DE', name: 'Germany', dialCode: '+49', currencyCode: 'EUR' },
  { code: 'FR', name: 'France', dialCode: '+33', currencyCode: 'EUR' },
  { code: 'JP', name: 'Japan', dialCode: '+81', currencyCode: 'JPY' },
];

/** Idempotently insert base currencies, then countries (FK order). */
export async function seedReferenceData(): Promise<void> {
  await dataSource
    .getRepository(Currency)
    .createQueryBuilder()
    .insert()
    .values(CURRENCIES)
    .orIgnore()
    .execute();
  console.log(`[seed] currencies ensured (${CURRENCIES.length})`);

  await dataSource
    .getRepository(Country)
    .createQueryBuilder()
    .insert()
    .values(COUNTRIES)
    .orIgnore()
    .execute();
  console.log(`[seed] countries ensured (${COUNTRIES.length})`);
}
