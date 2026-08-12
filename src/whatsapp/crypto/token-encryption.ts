/**
 * AES-256-GCM helpers for encrypting/decrypting WABA access tokens at rest.
 *
 * Storage format (Base64 URL-safe):
 *   <12-byte IV>.<16-byte auth-tag>.<ciphertext>
 *
 * Key source: ENCRYPTION_KEY env var — 64 hex chars (32 bytes).
 * If the key is absent (dev without secrets) the helpers throw; callers
 * should guard with a feature flag until the env is provisioned.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const SEP = '.';

function keyFromEnv(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
        'Generate with: openssl rand -hex 32',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function encryptToken(plaintext: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    enc.toString('base64url'),
  ].join(SEP);
}

export function decryptToken(ciphertext: string): string {
  const parts = ciphertext.split(SEP);
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }
  const ivB64 = parts[0]!;
  const tagB64 = parts[1]!;
  const encB64 = parts[2]!;
  const key = keyFromEnv();
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const enc = Buffer.from(encB64, 'base64url');

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Invalid IV or auth-tag length');
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(enc).toString('utf8') + decipher.final('utf8');
}
