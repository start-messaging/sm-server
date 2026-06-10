import dataSource from '../data-source';
import { Country } from '../../countries/entities/country.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { ServiceCategory } from '../../services/entities/service-category.entity';
import { ServiceCountryRate } from '../../services/entities/service-country-rate.entity';
import { Service, ServiceStatus } from '../../services/entities/service.entity';

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

const SERVICES: Array<Partial<Service>> = [
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    short: 'WABA',
    provider: 'Meta Cloud API',
    description:
      'Template & session messaging via the WhatsApp Business Platform.',
    status: ServiceStatus.ACTIVE,
  },
  {
    key: 'sms',
    name: 'SMS',
    short: 'SMS',
    provider: 'MSG91 · Twilio',
    description: 'Transactional and promotional SMS across global routes.',
    status: ServiceStatus.ACTIVE,
  },
  {
    key: 'instagram',
    name: 'Instagram Messaging',
    short: 'IG',
    provider: 'Meta Cloud API',
    description: 'Direct-message automation for Instagram business accounts.',
    status: ServiceStatus.BETA,
  },
];

const CATEGORIES: Array<Partial<ServiceCategory>> = [
  {
    serviceKey: 'whatsapp',
    key: 'marketing',
    label: 'Marketing',
    hint: 'Promotions, offers, announcements',
    sortOrder: 0,
  },
  {
    serviceKey: 'whatsapp',
    key: 'utility',
    label: 'Utility',
    hint: 'Order, account & transaction updates',
    sortOrder: 1,
  },
  {
    serviceKey: 'whatsapp',
    key: 'authentication',
    label: 'Authentication',
    hint: 'One-time passcodes',
    sortOrder: 2,
  },
  {
    serviceKey: 'whatsapp',
    key: 'service',
    label: 'Service',
    hint: 'User-initiated, free conversations',
    sortOrder: 3,
  },
  {
    serviceKey: 'sms',
    key: 'transactional',
    label: 'Transactional',
    hint: 'OTP, alerts, confirmations',
    sortOrder: 0,
  },
  {
    serviceKey: 'sms',
    key: 'promotional',
    label: 'Promotional',
    hint: 'Marketing & bulk campaigns',
    sortOrder: 1,
  },
  {
    serviceKey: 'instagram',
    key: 'message',
    label: 'Message',
    hint: 'Per delivered message',
    sortOrder: 0,
  },
];

// Example country-tier rates so the pricing detail page has data. Money is
// integer micros (1 unit = 1,000,000) in the country's own currency; currency
// must match the seeded country's currency.
const RATES: Array<Partial<ServiceCountryRate>> = [
  // WhatsApp · India (INR)
  { serviceKey: 'whatsapp', countryCode: 'IN', categoryKey: 'marketing', currency: 'INR', providerCostMicros: 600000, sellMicros: 900000 }, // prettier-ignore
  { serviceKey: 'whatsapp', countryCode: 'IN', categoryKey: 'utility', currency: 'INR', providerCostMicros: 120000, sellMicros: 200000 }, // prettier-ignore
  { serviceKey: 'whatsapp', countryCode: 'IN', categoryKey: 'authentication', currency: 'INR', providerCostMicros: 100000, sellMicros: 160000 }, // prettier-ignore
  { serviceKey: 'whatsapp', countryCode: 'IN', categoryKey: 'service', currency: 'INR', providerCostMicros: 0, sellMicros: 0 }, // prettier-ignore
  // WhatsApp · United States (USD)
  { serviceKey: 'whatsapp', countryCode: 'US', categoryKey: 'marketing', currency: 'USD', providerCostMicros: 25000, sellMicros: 40000 }, // prettier-ignore
  { serviceKey: 'whatsapp', countryCode: 'US', categoryKey: 'utility', currency: 'USD', providerCostMicros: 8000, sellMicros: 15000 }, // prettier-ignore
  { serviceKey: 'whatsapp', countryCode: 'US', categoryKey: 'authentication', currency: 'USD', providerCostMicros: 6000, sellMicros: 12000 }, // prettier-ignore
  // SMS · India (INR)
  { serviceKey: 'sms', countryCode: 'IN', categoryKey: 'transactional', currency: 'INR', providerCostMicros: 150000, sellMicros: 250000 }, // prettier-ignore
  { serviceKey: 'sms', countryCode: 'IN', categoryKey: 'promotional', currency: 'INR', providerCostMicros: 200000, sellMicros: 320000 }, // prettier-ignore
  // SMS · United States (USD)
  { serviceKey: 'sms', countryCode: 'US', categoryKey: 'transactional', currency: 'USD', providerCostMicros: 6000, sellMicros: 10000 }, // prettier-ignore
  { serviceKey: 'sms', countryCode: 'US', categoryKey: 'promotional', currency: 'USD', providerCostMicros: 7000, sellMicros: 12000 }, // prettier-ignore
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

  await dataSource
    .getRepository(Service)
    .createQueryBuilder()
    .insert()
    .values(SERVICES)
    .orIgnore()
    .execute();
  console.log(`[seed] services ensured (${SERVICES.length})`);

  await dataSource
    .getRepository(ServiceCategory)
    .createQueryBuilder()
    .insert()
    .values(CATEGORIES)
    .orIgnore()
    .execute();
  console.log(`[seed] service categories ensured (${CATEGORIES.length})`);

  await dataSource
    .getRepository(ServiceCountryRate)
    .createQueryBuilder()
    .insert()
    .values(RATES)
    .orIgnore()
    .execute();
  console.log(`[seed] service country rates ensured (${RATES.length})`);
}
