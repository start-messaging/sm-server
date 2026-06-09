import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PlatformStaff } from '../../src/admin/entities/platform-staff.entity';
import { Country } from '../../src/countries/entities/country.entity';
import { Currency } from '../../src/currencies/entities/currency.entity';
import { OtpVerification } from '../../src/otp/entities/otp-verification.entity';
import { ReferralPartner } from '../../src/referral/entities/referral-partner.entity';
import { User } from '../../src/users/entities/user.entity';

/**
 * Build the schema ONCE before the suite (we use TypeORM `synchronize` in dev
 * instead of migration files). The per-test app instances then boot with
 * `DB_SYNCHRONIZE=false` (see set-test-env.ts), so parallel jest workers don't
 * race to create the same enum types.
 */
export default async function globalSetup(): Promise<void> {
  loadEnv();
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
    ],
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
  });
  await ds.initialize();
  await ds.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await ds.query('CREATE EXTENSION IF NOT EXISTS citext');
  await ds.synchronize();
  // Reference tables (currencies, countries) key off a tiny code space and the
  // tests hand out deterministic per-worker codes, so leftover rows from a prior
  // run would collide. Start every run from a clean slate for just these tables;
  // other tables use unique emails/ids and don't accumulate collisions.
  await ds.query('TRUNCATE TABLE countries, currencies CASCADE');
  await ds.destroy();
}
