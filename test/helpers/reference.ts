import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from '../../src/countries/entities/country.entity';
import { Currency } from '../../src/currencies/entities/currency.entity';

/** Map any integer to an uppercase letter A–Z (wraps). */
const L = (n: number): string => String.fromCharCode(65 + (((n % 26) + 26) % 26));

/**
 * Reference codes live in a tiny space (2–3 letters), so tests must NOT pick
 * them at random: parallel jest workers share one DB and would collide. Each
 * worker owns a distinct first-letter prefix (its `JEST_WORKER_ID`) and hands
 * out codes from a monotonic per-worker counter, so every code is unique across
 * the whole run.
 */
const WORKER = (Number(process.env.JEST_WORKER_ID ?? '1') - 1) % 26;
let currencySeq = 0;
let countrySeq = 0;

/** Unique 3-letter code: `[worker][counter÷26][counter%26]` → 676 per worker. */
export const uniqueCurrencyCode = (): string => {
  const n = currencySeq++ % 676;
  return L(WORKER) + L(Math.floor(n / 26)) + L(n);
};

/** Unique 2-letter code: `[worker][counter]` → 26 per worker. */
export const uniqueCountryCode = (): string => L(WORKER) + L(countrySeq++);

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
