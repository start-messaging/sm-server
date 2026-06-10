import 'reflect-metadata';
// Side-effect import: forces DB_NAME=sm_server_test before we read config below,
// so the schema is built on the test DB (not the dev DB). dotenv won't override.
import './set-test-env';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PlatformStaff } from '../../src/admin/entities/platform-staff.entity';
import { Country } from '../../src/countries/entities/country.entity';
import { Currency } from '../../src/currencies/entities/currency.entity';
import { OtpVerification } from '../../src/otp/entities/otp-verification.entity';
import { ReferralPartner } from '../../src/referral/entities/referral-partner.entity';
import { ServiceCategory } from '../../src/services/entities/service-category.entity';
import { ServiceCountryRate } from '../../src/services/entities/service-country-rate.entity';
import { Service } from '../../src/services/entities/service.entity';
import { User } from '../../src/users/entities/user.entity';

/**
 * Build the schema ONCE before the suite (we use TypeORM `synchronize` in dev
 * instead of migration files). The per-test app instances then boot with
 * `DB_SYNCHRONIZE=false` (see set-test-env.ts), so parallel jest workers don't
 * race to create the same enum types.
 */
export default async function globalSetup(): Promise<void> {
  loadEnv();
  // HARD GUARD: this function DROPS the whole schema (`synchronize(true)`).
  // Refuse to touch anything that isn't explicitly a test database, no matter
  // how the env got assembled — this is the last line of defence for the dev DB.
  if (!process.env.DB_NAME?.endsWith('_test')) {
    throw new Error(
      `Refusing to run e2e setup against non-test database "${process.env.DB_NAME ?? '(unset)'}" — ` +
        'global-setup drops and rebuilds the schema. Test databases must end with "_test".',
    );
  }
  // Same guard for Redis: the suite must be pinned to the dedicated logical db
  // (set-test-env.ts), so test keys — and any future cleanup — can't hit dev db 0.
  if (process.env.REDIS_DB !== '15') {
    throw new Error(
      `Refusing to run e2e setup with REDIS_DB="${process.env.REDIS_DB ?? '(unset)'}" — tests must use Redis db 15.`,
    );
  }
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: [
      User,
      OtpVerification,
      PlatformStaff,
      ReferralPartner,
      Currency,
      Country,
      Service,
      ServiceCategory,
      ServiceCountryRate,
    ],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
  });
  await ds.initialize();
  await ds.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await ds.query('CREATE EXTENSION IF NOT EXISTS citext');
  // Rebuild the test schema from scratch every run (dropBeforeSync) so it always
  // matches the current entities — no drift from older column/enum shapes, and no
  // leftover rows from a prior run. Safe: this targets the dedicated
  // sm_server_test database (see set-test-env.ts), never the dev DB.
  await ds.synchronize(true);
  await ds.destroy();
}
