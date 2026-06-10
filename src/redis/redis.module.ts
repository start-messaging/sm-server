import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { EnvVars } from '../config/env.validation';
import { REDIS } from './redis.constants';
import { RedisService } from './redis.service';

/**
 * Global Redis access. The raw client is provided under the `REDIS` token;
 * most code should use `RedisService`. Sessions live here for instant logout.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvVars, true>) =>
        new Redis({
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          // Logical DB index — 0 in dev/prod, 15 under e2e (test isolation).
          db: config.get('REDIS_DB', { infer: true }),
          maxRetriesPerRequest: null,
        }),
    },
    RedisService,
  ],
  exports: [REDIS, RedisService],
})
export class RedisModule {}
