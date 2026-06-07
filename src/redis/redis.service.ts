import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.constants';

/**
 * Thin wrapper over the ioredis client with the handful of operations the
 * session store needs, plus graceful shutdown.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly client: Redis) {}

  get raw(): Redis {
    return this.client;
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<'OK' | null> {
    return ttlSeconds
      ? this.client.set(key, value, 'EX', ttlSeconds)
      : this.client.set(key, value);
  }

  get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  del(...keys: string[]): Promise<number> {
    return keys.length ? this.client.del(...keys) : Promise.resolve(0);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  sadd(key: string, member: string): Promise<number> {
    return this.client.sadd(key, member);
  }

  srem(key: string, member: string): Promise<number> {
    return this.client.srem(key, member);
  }

  smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  expire(key: string, ttlSeconds: number): Promise<number> {
    return this.client.expire(key, ttlSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
