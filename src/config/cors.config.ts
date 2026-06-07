import { INestApplication } from '@nestjs/common';
import { DEFAULT_CORS_ORIGINS } from './env.validation';

/**
 * Browser clients (sm-client :5173, sm-admin :5174) call the API cross-origin,
 * and the auth flow sends credentials (the `Authorization` header today, an
 * httpOnly refresh cookie later), so CORS must allow the specific origins with
 * `credentials: true`.
 *
 * The allowlist comes from `CORS_ORIGINS` (comma-separated). We read it from
 * `process.env` (ConfigModule has already loaded `.env` into the environment by
 * the time this runs) so `applyCors` stays dependency-free like the other
 * bootstrap configs — usable even by isolated test modules without ConfigModule.
 * Lock it down to the real domains in production.
 */
export function applyCors(app: INestApplication): void {
  const origins = (process.env.CORS_ORIGINS ?? DEFAULT_CORS_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });
}
