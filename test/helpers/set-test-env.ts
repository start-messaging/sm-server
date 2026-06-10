// Test environment overrides, applied before the app/config loads. Set here (not
// in .env) so they apply no matter how jest is invoked. dotenv / @nestjs/config
// do not override variables already present in process.env, so these win.

// Tests are tests — make sure any future NODE_ENV-conditional behaviour
// (dev-only seeding, cron, mail drivers) never runs inside the suite.
process.env.NODE_ENV = 'test';

// Run the whole e2e suite against the dedicated test database, never the dev DB.
process.env.DB_NAME = 'sm_server_test';

// The schema is built once in global-setup.ts; individual app instances must
// not re-run synchronize (parallel workers would race on enum creation).
process.env.DB_SYNCHRONIZE = 'false';

// Each parallel jest worker boots its own app (and pool); keep the pool small so
// the whole suite stays well under Postgres `max_connections` (default 100).
process.env.DB_POOL_MAX = '5';

// Isolate test Redis keys (sessions, OTPs) from dev on a shared server by using
// the last logical database index. Dev/prod stay on the default db 0.
process.env.REDIS_DB = '15';

// Specs and helpers issue OTPs back-to-back (signup → set-mobile → re-issue);
// the issue cooldown would 429 them. Disabled suite-wide — ONLY the dedicated
// otp-cooldown spec overrides this (per-file, before createTestApp).
process.env.OTP_RESEND_COOLDOWN_SEC = '0';
