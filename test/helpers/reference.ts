import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../../src/countries/entities/country.entity';
import { Currency } from '../../src/currencies/entities/currency.entity';
import { ServiceCategory } from '../../src/services/entities/service-category.entity';
import { ServiceCountryRate } from '../../src/services/entities/service-country-rate.entity';
import {
  Service,
  ServiceStatus,
} from '../../src/services/entities/service.entity';

/** Map any integer to an uppercase letter A–Z (wraps). */
const L = (n: number): string =>
  String.fromCharCode(65 + (((n % 26) + 26) % 26));

/**
 * Reference codes live in a small space (2–3 letters / short slugs) and the DB
 * is shared across parallel jest workers, so codes must not collide. Each worker
 * owns a distinct first-letter prefix (`JEST_WORKER_ID`), which rules out
 * CROSS-worker clashes. Within a worker, jest resets module state per test file
 * so the counter restarts — fine for `seed*` ("this row exists", they upsert),
 * but any test that asserts a code is ABSENT (create / not-found) must use the
 * `fresh*` helpers, which delete the row first (safe: same-worker files run
 * serially, other workers use a different prefix). Cross-RUN leftovers are
 * cleared by global-setup's TRUNCATE.
 */
const WORKER = (Number(process.env.JEST_WORKER_ID ?? '1') - 1) % 26;
let currencySeq = 0;
let countrySeq = 0;
let serviceSeq = 0;

/** Unique 3-letter code: `[worker][n÷26][n%26]`. */
export const uniqueCurrencyCode = (): string => {
  const n = currencySeq++ % 676;
  return L(WORKER) + L(Math.floor(n / 26)) + L(n);
};

/** Unique 2-letter code: `[worker][n]`. */
export const uniqueCountryCode = (): string => L(WORKER) + L(countrySeq++);

/** Unique service key slug (roomy varchar) — `svc<worker>x<n>`. */
export const uniqueServiceKey = (): string => `svc${WORKER}x${serviceSeq++}`;

/** Seed a currency directly via the repo and return its code. */
export async function seedCurrency(
  app: INestApplication,
  overrides: Partial<Currency> = {},
): Promise<string> {
  const repo = app.get<Repository<Currency>>(getRepositoryToken(Currency));
  const code = overrides.code ?? uniqueCurrencyCode();
  await repo.save(
    repo.create({
      code,
      name: `Test ${code}`,
      symbol: '¤',
      decimalPlaces: 2,
      isActive: true,
      ...overrides,
    }),
  );
  return code;
}

/** Seed a country (and its currency unless provided) and return its code. */
export async function seedCountry(
  app: INestApplication,
  overrides: Partial<Country> = {},
): Promise<string> {
  const repo = app.get<Repository<Country>>(getRepositoryToken(Country));
  const currencyCode = overrides.currencyCode ?? (await seedCurrency(app));
  const code = overrides.code ?? uniqueCountryCode();
  await repo.save(
    repo.create({
      code,
      name: `Test ${code}`,
      dialCode: '+999',
      currencyCode,
      isActive: true,
      ...overrides,
    }),
  );
  return code;
}

/**
 * Seed a service directly via the repo and return its key. Idempotent: the row
 * (and its cascade children — categories, rates) is deleted first, so a key
 * reused across same-worker files (the per-file counter resets) starts clean.
 */
export async function seedService(
  app: INestApplication,
  overrides: Partial<Service> = {},
): Promise<string> {
  const repo = app.get<Repository<Service>>(getRepositoryToken(Service));
  const key = overrides.key ?? uniqueServiceKey();
  await repo.delete({ key });
  await repo.save(
    repo.create({
      key,
      name: `Test ${key}`,
      short: 'TST',
      provider: 'Test Provider',
      description: null,
      status: ServiceStatus.ACTIVE,
      ...overrides,
    }),
  );
  return key;
}

/** Seed a category under a service and return its key (idempotent on the pair). */
export async function seedCategory(
  app: INestApplication,
  serviceKey: string,
  overrides: Partial<ServiceCategory> = {},
): Promise<string> {
  const repo = app.get<Repository<ServiceCategory>>(
    getRepositoryToken(ServiceCategory),
  );
  const key = overrides.key ?? `cat${serviceSeq++}`;
  // Surrogate uuid PK + unique (serviceKey, key): delete first so re-seeding the
  // same pair (same-worker files reuse keys) inserts cleanly instead of clashing.
  await repo.delete({ serviceKey, key });
  await repo.save(
    repo.create({
      serviceKey,
      key,
      label: `Test ${key}`,
      hint: null,
      sortOrder: 0,
      ...overrides,
    }),
  );
  return key;
}

/** Seed a single service-country rate row directly via the repo. */
export async function seedRate(
  app: INestApplication,
  rate: {
    serviceKey: string;
    countryCode: string;
    categoryKey: string;
    currency: string;
    providerCostMicros?: number | null;
    sellMicros?: number | null;
    isActive?: boolean;
  },
): Promise<void> {
  const repo = app.get<Repository<ServiceCountryRate>>(
    getRepositoryToken(ServiceCountryRate),
  );
  // Idempotent on the unique triple — see seedCategory note.
  await repo.delete({
    serviceKey: rate.serviceKey,
    countryCode: rate.countryCode,
    categoryKey: rate.categoryKey,
  });
  await repo.save(
    repo.create({
      providerCostMicros: null,
      sellMicros: null,
      isActive: true,
      ...rate,
    }),
  );
}

/* ----- "guaranteed absent" codes for create / not-found assertions ----- */
// Generate a worker-unique code/key, then delete any row with it so the code is
// definitely absent right now. Use wherever a test asserts a create succeeds or
// a row is not found. Currencies and countries are RESTRICT targets, so their
// dependents (rates → countries) are cleared first — a sibling file in the same
// worker (counters reset per file) may have left rows under the reused code.

export async function freshCurrencyCode(
  app: INestApplication,
): Promise<string> {
  const code = uniqueCurrencyCode();
  await app
    .get<Repository<ServiceCountryRate>>(getRepositoryToken(ServiceCountryRate))
    .delete({ currency: code });
  await app
    .get<Repository<Country>>(getRepositoryToken(Country))
    .delete({ currencyCode: code });
  await app
    .get<Repository<Currency>>(getRepositoryToken(Currency))
    .delete({ code });
  return code;
}

export async function freshCountryCode(app: INestApplication): Promise<string> {
  const code = uniqueCountryCode();
  await app
    .get<Repository<ServiceCountryRate>>(getRepositoryToken(ServiceCountryRate))
    .delete({ countryCode: code });
  await app
    .get<Repository<Country>>(getRepositoryToken(Country))
    .delete({ code });
  return code;
}

export async function freshServiceKey(app: INestApplication): Promise<string> {
  const key = uniqueServiceKey();
  await app
    .get<Repository<Service>>(getRepositoryToken(Service))
    .delete({ key });
  return key;
}
