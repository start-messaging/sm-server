import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'crypto';

/**
 * Helpers for high-entropy opaque tokens and OTP codes.
 *  - `randomToken` / `sha256`: generate a refresh or verification token and the
 *    digest we actually store (the raw token is never persisted).
 *  - `numericCode`: a zero-padded numeric OTP code.
 */
@Injectable()
export class HashService {
  /** Random hex token. 32 bytes → 64 hex chars. */
  randomToken(bytes = 32): string {
    return randomBytes(bytes).toString('hex');
  }

  /** SHA-256 hex digest — for hashing high-entropy opaque tokens before storage. */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Zero-padded numeric code, e.g. '004281'. */
  numericCode(length = 6): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, '0');
  }
}
