import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing with Argon2id. Used for customer and staff passwords and for
 * OTP codes (low-entropy secrets that benefit from a slow hash).
 */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
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
