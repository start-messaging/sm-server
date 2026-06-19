import * as Joi from 'joi';

/** Dev default CORS allowlist: the client + admin SPA dev servers. */
export const DEFAULT_CORS_ORIGINS =
  'http://localhost:5173,http://localhost:5174';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Comma-separated browser origins allowed to call the API (CORS). Defaults to
  // the two dev SPAs; lock down to real domains in production.
  CORS_ORIGINS: Joi.string().default(DEFAULT_CORS_ORIGINS),

  // Admin SPA base URL — used to build staff-invite links in emails.
  ADMIN_APP_URL: Joi.string().uri().default('http://localhost:5174'),

  // Customer SPA base URL — used to build workspace member-invite links.
  CLIENT_APP_URL: Joi.string().uri().default('http://localhost:5173'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  // Dev convenience: auto-sync schema from entities. NEVER true in production.
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  // Max Postgres connections per pool. Bounded small under the e2e suite so
  // many parallel jest workers (one app each) don't exhaust `max_connections`.
  DB_POOL_MAX: Joi.number().min(1).default(10),

  // Argon2id cost factors for password/OTP hashing. Production defaults are
  // strong; the e2e suite lowers them (set-test-env.ts) so its ~dozens of real
  // signup flows don't spend seconds in the KDF. `verify` reads params from the
  // stored hash, so lowering the cost never breaks verification.
  ARGON2_TIME_COST: Joi.number().min(1).default(3),
  ARGON2_MEMORY_COST: Joi.number().min(8).default(65536),

  // Redis — required; sessions live here (instant logout).
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  // Logical Redis database index. Dev/prod use 0; the e2e suite pins 15 so test
  // keys (sessions, OTPs) never mix with dev data on a shared Redis server.
  REDIS_DB: Joi.number().integer().min(0).max(15).default(0),

  // Customer auth.
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().default(30),
  OTP_TTL_MIN: Joi.number().default(10),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),
  // Minimum seconds between OTP issues for the same subject+purpose (any
  // channel) — caps email/SMS send abuse. 0 disables (tests).
  OTP_RESEND_COOLDOWN_SEC: Joi.number().min(0).default(60),

  // Platform staff auth.
  ADMIN_JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  ADMIN_JWT_ACCESS_TTL: Joi.string().default('15m'),
  ADMIN_BOOTSTRAP_EMAIL: Joi.string().email().required(),
  ADMIN_BOOTSTRAP_PASSWORD: Joi.string().min(8).required(),

  // Referral partner auth.
  REFERRAL_JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  REFERRAL_JWT_ACCESS_TTL: Joi.string().default('15m'),

  // Mailer (provider is swappable via MAIL_DRIVER).
  MAIL_DRIVER: Joi.string()
    .valid('console', 'mailgun', 'smtp')
    .default('console'),
  MAIL_FROM: Joi.string().default('no-reply@localhost'),
  MAILGUN_API_KEY: Joi.string().optional(),
  MAILGUN_DOMAIN: Joi.string().optional(),

  // SMS (provider is swappable via SMS_DRIVER; only console implemented yet).
  SMS_DRIVER: Joi.string().valid('console', 'twilio').default('console'),
})
  .unknown(true)
  // Cooldown must fit inside the code's lifetime: if it didn't, an expired
  // code would still block re-issuing (latest row inside the cooldown window
  // but no open row) and EVERY user whose code lapsed would be locked out.
  .custom(
    (env: { OTP_TTL_MIN: number; OTP_RESEND_COOLDOWN_SEC: number }, helpers) =>
      env.OTP_RESEND_COOLDOWN_SEC > env.OTP_TTL_MIN * 60
        ? helpers.message({
            custom:
              'OTP_RESEND_COOLDOWN_SEC must not exceed OTP_TTL_MIN * 60 (an expired code would block re-issuing)',
          })
        : env,
  );

export interface EnvVars {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  CORS_ORIGINS: string;
  ADMIN_APP_URL: string;
  CLIENT_APP_URL: string;

  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SSL: boolean;
  DB_LOGGING: boolean;
  DB_SYNCHRONIZE: boolean;
  DB_POOL_MAX: number;
  ARGON2_TIME_COST: number;
  ARGON2_MEMORY_COST: number;

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;

  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL_DAYS: number;
  OTP_TTL_MIN: number;
  OTP_MAX_ATTEMPTS: number;
  OTP_RESEND_COOLDOWN_SEC: number;

  ADMIN_JWT_ACCESS_SECRET: string;
  ADMIN_JWT_ACCESS_TTL: string;
  ADMIN_BOOTSTRAP_EMAIL: string;
  ADMIN_BOOTSTRAP_PASSWORD: string;

  REFERRAL_JWT_ACCESS_SECRET: string;
  REFERRAL_JWT_ACCESS_TTL: string;

  MAIL_DRIVER: 'console' | 'mailgun' | 'smtp';
  MAIL_FROM: string;
  MAILGUN_API_KEY?: string;
  MAILGUN_DOMAIN?: string;

  SMS_DRIVER: 'console' | 'twilio';
}
