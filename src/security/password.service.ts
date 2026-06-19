import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { EnvVars } from '../config/env.validation';

/**
 * Password hashing with Argon2id. Used for customer and staff passwords and for
 * OTP codes (low-entropy secrets that benefit from a slow hash). Cost factors
 * are config-driven (strong in production; lowered under e2e so the suite's
 * many real signup flows aren't dominated by the KDF). `verify` reads the
 * params back out of the encoded hash, so changing the cost is always safe.
 */
@Injectable()
export class PasswordService {
  private readonly options: argon2.Options;

  constructor(config: ConfigService<EnvVars, true>) {
    this.options = {
      type: argon2.argon2id,
      timeCost: config.get('ARGON2_TIME_COST', { infer: true }),
      memoryCost: config.get('ARGON2_MEMORY_COST', { infer: true }),
    };
  }

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Malformed/legacy hash — treat as a mismatch rather than throwing.
      return false;
    }
  }
}
