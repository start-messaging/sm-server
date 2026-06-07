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

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SSL: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),
  // Dev convenience: auto-sync schema from entities. NEVER true in production.
  DB_SYNCHRONIZE: Joi.boolean().default(false),

  // Redis — required; sessions live here (instant logout).
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  // Customer auth.
  JWT_ACCESS_SECRET: Joi.string().min(16).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().default(30),
  OTP_TTL_MIN: Joi.number().default(10),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),

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
}).unknown(true);

export interface EnvVars {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  CORS_ORIGINS: string;

  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;
  DB_SSL: boolean;
  DB_LOGGING: boolean;
  DB_SYNCHRONIZE: boolean;

  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;

  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL_DAYS: number;
  OTP_TTL_MIN: number;
  OTP_MAX_ATTEMPTS: number;

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
}
