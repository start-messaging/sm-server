import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { join } from 'path';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import type { EnvVars } from './env.validation';

/**
 * Builds TypeORM options from a validated ConfigService.
 *
 * `synchronize` is driven by `DB_SYNCHRONIZE` — ON in dev (auto-sync schema
 * from entities, no migration files needed), OFF in production (use migrations).
 * `autoLoadEntities` lets each feature module register its entities via
 * `TypeOrmModule.forFeature([...])` without a central entity registry.
 */
export const buildTypeOrmOptions = (
  config: ConfigService<EnvVars, true>,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get('DB_HOST', { infer: true }),
  port: config.get('DB_PORT', { infer: true }),
  username: config.get('DB_USERNAME', { infer: true }),
  password: config.get('DB_PASSWORD', { infer: true }),
  database: config.get('DB_NAME', { infer: true }),
  ssl: config.get('DB_SSL', { infer: true })
    ? { rejectUnauthorized: false }
    : false,
  logging: config.get('DB_LOGGING', { infer: true }),
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: config.get('DB_SYNCHRONIZE', { infer: true }),
  // Bound the connection pool so parallel e2e workers (one app each) stay well
  // under Postgres `max_connections`; tunable per environment.
  extra: { max: config.get('DB_POOL_MAX', { infer: true }) },
  migrationsRun: false,
  autoLoadEntities: true,
  migrations: [join(__dirname, '..', 'database', 'migrations', '*.{ts,js}')],
});
