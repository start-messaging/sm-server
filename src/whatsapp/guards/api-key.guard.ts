import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { IsNull, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { HashService } from '../../security/hash.service';
import { WaApiKey } from '../entities/wa-api-key.entity';
import { API_KEY_PATTERN } from '../services/whatsapp-api-keys.service';

/** What the guard attaches to the request for the trigger handler. */
export interface ApiKeyScopedRequest extends Request {
  apiKeyWorkspaceId: string;
  apiKeyId: string;
}

/**
 * Bearer-token auth for the public trigger API. Resolves the raw key to the
 * workspace that owns it — there is no user and no membership here, so the
 * route must never read `workspaceCtx`.
 *
 * Every rejection is the same opaque 401: nothing distinguishes a malformed
 * key from a revoked one.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @InjectRepository(WaApiKey)
    private readonly keys: Repository<WaApiKey>,
    private readonly hash: HashService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<ApiKeyScopedRequest>();
    const raw = (req.headers.authorization ?? '')
      .replace(/^Bearer\s+/i, '')
      .trim();
    if (!API_KEY_PATTERN.test(raw)) throw invalidKey();

    const key = await this.keys.findOne({
      where: { keyHash: this.hash.sha256(raw), revokedAt: IsNull() },
    });
    if (!key) throw invalidKey();

    req.apiKeyWorkspaceId = key.workspaceId;
    req.apiKeyId = key.id;

    // Last-used is telemetry for the Settings UI — never block the send on it.
    void this.keys.update(key.id, { lastUsedAt: new Date() }).catch(() => {});

    return true;
  }
}

function invalidKey(): AppException {
  return new AppException(
    {
      code: 'INVALID_API_KEY',
      message:
        'Missing or invalid API key. Send it as `Authorization: Bearer sm_live_…`.',
    },
    401,
  );
}
