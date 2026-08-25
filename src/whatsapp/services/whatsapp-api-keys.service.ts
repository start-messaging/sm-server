import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { HashService } from '../../security/hash.service';
import { WaApiKey } from '../entities/wa-api-key.entity';

/** Live-key marker. A `sm_test_` family can be added later without a migration. */
export const API_KEY_PREFIX = 'sm_live_';

/** How much of the raw key is safe to store and show in the Settings UI. */
export const API_KEY_PREFIX_LENGTH = 12;

/** `sm_live_` + 32 lowercase hex chars = 40 chars, 128 bits of entropy. */
export const API_KEY_PATTERN = /^sm_live_[0-9a-f]{32}$/;

export interface ApiKeyDto {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateApiKeyResult {
  key: ApiKeyDto;
  rawKey: string;
}

/**
 * API keys for the public outbound trigger endpoint.
 *
 * The raw key is high-entropy and machine-generated, so it is digested with
 * SHA-256 (`HashService`, the same treatment as refresh tokens) rather than a
 * password KDF: the digest is unique and indexed, so authentication is a
 * single lookup instead of a scan over every key sharing a prefix.
 */
@Injectable()
export class WhatsappApiKeysService {
  constructor(
    @InjectRepository(WaApiKey)
    private readonly keys: Repository<WaApiKey>,
    private readonly hash: HashService,
  ) {}

  async list(workspaceId: string): Promise<WaApiKey[]> {
    return this.keys.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(
    workspaceId: string,
    name: string,
  ): Promise<{ key: WaApiKey; rawKey: string }> {
    const rawKey = API_KEY_PREFIX + randomBytes(16).toString('hex');
    const key = this.keys.create({
      workspaceId,
      name: name.trim(),
      keyHash: this.hash.sha256(rawKey),
      keyPrefix: rawKey.slice(0, API_KEY_PREFIX_LENGTH),
      lastUsedAt: null,
      revokedAt: null,
    });
    await this.keys.save(key);
    return { key, rawKey };
  }

  async revoke(workspaceId: string, id: string): Promise<void> {
    const key = await this.keys.findOne({ where: { id, workspaceId } });
    if (!key) {
      throw new AppException(
        { code: 'API_KEY_NOT_FOUND', message: 'API key not found' },
        404,
      );
    }
    // Revocation is permanent; re-revoking keeps the original timestamp.
    if (!key.revokedAt) {
      key.revokedAt = new Date();
      await this.keys.save(key);
    }
  }

  static serialize(key: WaApiKey): ApiKeyDto {
    return {
      id: key.id,
      name: key.name,
      keyPrefix: key.keyPrefix,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      revokedAt: key.revokedAt?.toISOString() ?? null,
      createdAt: key.createdAt.toISOString(),
    };
  }

  static serializeWithRaw(key: WaApiKey, rawKey: string): CreateApiKeyResult {
    return { key: WhatsappApiKeysService.serialize(key), rawKey };
  }
}
