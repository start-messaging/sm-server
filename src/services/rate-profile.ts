import { ServiceCountryRate } from './entities/service-country-rate.entity';
import { Service } from './entities/service.entity';

/** One priced (or unpriced) cell within a country group. */
export interface RateProfile {
  categoryKey: string;
  providerCostMicros: number | null;
  sellMicros: number | null;
  isActive: boolean;
}

/** All of a service's rates for one country, in that country's currency. */
export interface CountryRatesProfile {
  countryCode: string;
  countryName: string;
  currency: string;
  /** Display symbol for the UI, e.g. `₹`, `$`. */
  currencySymbol: string;
  /** Display fraction digits for the UI (storage is always micros). */
  currencyDecimalPlaces: number;
  rates: RateProfile[];
}

/** The grouped view returned by `GET /:key/rates`. */
export interface ServiceRatesView {
  service: {
    key: string;
    name: string;
    categories: { key: string; label: string }[];
  };
  countries: CountryRatesProfile[];
}

export function presentRate(r: ServiceCountryRate): RateProfile {
  return {
    categoryKey: r.categoryKey,
    providerCostMicros: r.providerCostMicros,
    sellMicros: r.sellMicros,
    isActive: r.isActive,
  };
}

/**
 * Group a service's rate rows by country (in the service's category order),
 * skipping any stale row whose category no longer exists — so a removed
 * category can never render under a missing tab.
 */
export function buildServiceRatesView(
  service: Service,
  rows: ServiceCountryRate[],
): ServiceRatesView {
  const categories = [...(service.categories ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key),
  );
  const order = new Map(categories.map((c, i) => [c.key, i]));

  const byCountry = new Map<string, CountryRatesProfile>();
  for (const r of rows) {
    if (!order.has(r.categoryKey)) continue; // stale category → skip
    let group = byCountry.get(r.countryCode);
    if (!group) {
      group = {
        countryCode: r.countryCode,
        countryName: r.country?.name ?? r.countryCode,
        currency: r.currency,
        currencySymbol: r.currencyRef?.symbol ?? r.currency,
        currencyDecimalPlaces: r.currencyRef?.decimalPlaces ?? 2,
        rates: [],
      };
      byCountry.set(r.countryCode, group);
    }
    group.rates.push(presentRate(r));
  }

  for (const group of byCountry.values()) {
    group.rates.sort(
      (a, b) =>
        (order.get(a.categoryKey) ?? 0) - (order.get(b.categoryKey) ?? 0),
    );
  }

  const countries = [...byCountry.values()].sort((a, b) =>
    a.countryCode.localeCompare(b.countryCode),
  );

  return {
    service: {
      key: service.key,
      name: service.name,
      categories: categories.map((c) => ({ key: c.key, label: c.label })),
    },
    countries,
  };
}
