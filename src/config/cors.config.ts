import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from './env.validation';

/**
 * Browser clients (sm-client :5173, sm-admin :5174) call the API cross-origin,
 * and the auth flow sends credentials (the `Authorization` header today, an
 * httpOnly refresh cookie later), so CORS must allow the specific origins with
 * `credentials: true`.
 *
 * The allowlist comes from `CORS_ORIGINS` (comma-separated) so production can
 * lock it down to the real domains without a code change.
 */
export function applyCors(app: INestApplication): void {
  const config = app.get<ConfigService<EnvVars, true>>(ConfigService);
  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });
}
