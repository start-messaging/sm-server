import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { join } from 'path';

loadEnv();

/**
 * Standalone DataSource consumed by the TypeORM CLI for
 * `migration:generate` / `migration:run` / `migration:revert`.
 *
 * The runtime app uses `buildTypeOrmOptions()` driven by ConfigService —
 * keep both in sync when adding fields like `ssl`, `extra`, etc.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
