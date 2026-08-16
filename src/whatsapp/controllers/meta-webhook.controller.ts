/**
 * Meta webhook endpoint — public (no JWT auth).
 *
 * GET  /v1/webhooks/meta — hub.challenge verification
 * POST /v1/webhooks/meta — inbound webhook events
 *
 * On POST:
 *   1. Verify X-Hub-Signature-256 with APP_SECRET
 *   2. INSERT wa_webhook_events with dedup guard (Redis SETNX fast-path)
 *   3. Enqueue job on wa-webhooks queue
 *   4. Respond 200 immediately — never block on processing
 */
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import { AppException } from '../../common/exceptions/app.exception';
import { RedisService } from '../../redis/redis.service';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  WaWebhookEvent,
  WaWebhookEventStatus,
  WaWebhookEventType,
} from '../entities/wa-webhook-event.entity';
import type { WaWebhookJobData } from '../queue/wa-webhook.processor';
import { WA_WEBHOOK_QUEUE } from '../queue/wa-webhook.constants';
import { WA_ERR } from '../whatsapp-error-codes';

/** TTL for the Redis dedup key — 7 days gives replay protection. */
const DEDUP_TTL_SEC = 7 * 24 * 60 * 60;

@ApiExcludeController()
@Controller({ path: 'webhooks/meta', version: '1' })
export class MetaWebhookController {
  private readonly logger = new Logger(MetaWebhookController.name);
  private readonly verifyToken: string;
  private readonly appSecret: string;

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    private readonly redis: RedisService,
    @InjectRepository(WaWebhookEvent)
    private readonly events: Repository<WaWebhookEvent>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectQueue(WA_WEBHOOK_QUEUE)
    private readonly queue: Queue<WaWebhookJobData>,
  ) {
    this.verifyToken =
      config.get('META_WEBHOOK_VERIFY_TOKEN', { infer: true }) ?? '';
    this.appSecret = config.get('META_APP_SECRET', { infer: true }) ?? '';
  }

  /** Meta hub.challenge verification — responds with the raw challenge string. */
  @Get()
  @Header('Content-Type', 'text/plain')
  hubChallenge(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode !== 'subscribe' || token !== this.verifyToken) {
      this.logger.warn('Webhook verification failed — bad token or mode');
      throw new AppException(
        {
          code: WA_ERR.WEBHOOK_VERIFY_FAILED,
          message: 'Webhook verification failed',
        },
        403,
      );
    }
    this.logger.log('Webhook hub.challenge accepted');
    return challenge;
  }

  /** Ingest Meta webhook delivery — verify, persist, enqueue, 200. */
  @Post()
  @HttpCode(HttpStatus.OK)
  async ingest(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<{ received: true }> {
    // Verify signature
    this.verifySignature(req.rawBody, signature);

    const entries = this.extractEntries(body);

    for (const entry of entries) {
      await this.processEntry(entry, body);
    }

    return { received: true };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private verifySignature(
    rawBody: Buffer | undefined,
    signature: string | undefined,
  ): void {
    if (!this.appSecret) {
      // No app secret configured — allow in dev only
      this.logger.warn('META_APP_SECRET not set — skipping signature check');
      return;
    }
    if (!rawBody || !signature) {
      throw new AppException(
        {
          code: WA_ERR.WEBHOOK_SIGNATURE_INVALID,
          message: 'Missing signature',
        },
        400,
      );
    }
    const expected =
      'sha256=' +
      createHmac('sha256', this.appSecret).update(rawBody).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    const match =
      sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);

    if (!match) {
      throw new AppException(
        {
          code: WA_ERR.WEBHOOK_SIGNATURE_INVALID,
          message: 'Invalid signature',
        },
        401,
      );
    }
  }

  private extractEntries(body: Record<string, unknown>): MetaWebhookEntry[] {
    const entries = body['entry'];
    if (!Array.isArray(entries)) return [];
    return entries as MetaWebhookEntry[];
  }

  private async processEntry(
    entry: MetaWebhookEntry,
    fullPayload: Record<string, unknown>,
  ): Promise<void> {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const dedupKey = buildDedupKey(entry, change);
      const redisKey = `wa:dedup:${dedupKey}`;

      // Fast-path Redis dedup — skip if we've already seen this key.
      const alreadySeen = await this.redis.exists(redisKey);
      if (alreadySeen) {
        this.logger.debug(`Skipping duplicate webhook ${dedupKey}`);
        continue;
      }
      await this.redis.set(redisKey, '1', DEDUP_TTL_SEC);

      const wabaId = entry.id;
      let wabaAccountId: string | null = null;
      if (wabaId) {
        const waba = await this.wabaAccounts.findOne({
          where: { metaWabaId: wabaId },
          select: { id: true },
        });
        wabaAccountId = waba?.id ?? null;
      }

      const eventType = deriveEventType(change);

      let event: WaWebhookEvent;
      try {
        event = this.events.create({
          providerKey: 'meta_cloud',
          eventType,
          dedupKey,
          wabaAccountId,
          metaPhoneNumberId: extractPhoneNumberId(change),
          metaEventTs: extractMetaTs(change),
          status: WaWebhookEventStatus.PENDING,
          attempts: 0,
          payload: fullPayload,
        });
        await this.events.save(event);
      } catch (err) {
        // Duplicate key — another pod beat us (race); safe to skip
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('duplicate') || msg.includes('unique')) {
          this.logger.debug(`Duplicate insert for ${dedupKey} — skipping`);
          continue;
        }
        throw err;
      }

      await this.queue.add(
        'process',
        { eventId: event.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 500,
          removeOnFail: 200,
        },
      );
    }
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface MetaWebhookChange {
  field?: string;
  value?: Record<string, unknown>;
}

interface MetaWebhookEntry {
  id?: string;
  /** Unix seconds — Meta webhook trigger time; stabilizes lifecycle dedup. */
  time?: number;
  changes?: MetaWebhookChange[];
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

function buildDedupKey(
  entry: MetaWebhookEntry,
  change: MetaWebhookChange,
): string {
  const field = change.field ?? 'unknown';
  const value = change.value ?? {};
  const wabaInfo = value['waba_info'] as Record<string, unknown> | undefined;
  // Prefer real WABA id — entry.id is often the owner business portfolio id.
  const scopeId =
    (typeof wabaInfo?.['waba_id'] === 'string'
      ? wabaInfo['waba_id']
      : undefined) ??
    entry.id ??
    'unknown';
  const entryTime =
    typeof entry.time === 'number' ? String(entry.time) : 'nots';

  // For message status: wamid + status
  const statuses = value['statuses'];
  if (Array.isArray(statuses) && statuses.length > 0) {
    const s = statuses[0] as Record<string, string>;
    return `status:${s.id}:${s.status}`;
  }

  // For messages
  const messages = value['messages'];
  if (Array.isArray(messages) && messages.length > 0) {
    const m = messages[0] as Record<string, string>;
    return `msg:${m.id}`;
  }

  // account_update / template status: include WABA + Meta event time so a
  // later reconnect (new PARTNER_APP_INSTALLED) is not collapsed with an
  // earlier install under the same business id.
  const accountEvent = value['event'];
  if (typeof accountEvent === 'string') {
    const phone =
      typeof value['phone_number'] === 'string' ? value['phone_number'] : '';
    const templateName =
      typeof value['message_template_name'] === 'string'
        ? value['message_template_name']
        : '';
    const templateLang =
      typeof value['message_template_language'] === 'string'
        ? value['message_template_language']
        : '';
    const partnerAppId =
      typeof wabaInfo?.['partner_app_id'] === 'string'
        ? wabaInfo['partner_app_id']
        : '';
    return `field:${scopeId}:${field}:${accountEvent}:${phone}:${templateName}:${templateLang}:${partnerAppId}:${entryTime}`;
  }

  // Fallback: field + JSON hash of value (avoid Date.now — never dedups)
  const fingerprint = Buffer.from(JSON.stringify(value))
    .toString('base64url')
    .slice(0, 48);
  return `other:${scopeId}:${field}:${fingerprint}:${entryTime}`;
}

function deriveEventType(change: MetaWebhookChange): WaWebhookEventType {
  const field = change.field ?? '';

  switch (field) {
    case 'messages': {
      const value = change.value ?? {};
      if (Array.isArray(value['statuses'])) {
        return WaWebhookEventType.MESSAGE_STATUS;
      }
      if (Array.isArray(value['messages'])) {
        return WaWebhookEventType.INBOUND_MESSAGE;
      }
      // echoes / empty — still under messages topic
      return WaWebhookEventType.OTHER;
    }
    case 'message_template_status_update':
      return WaWebhookEventType.TEMPLATE_STATUS;
    case 'account_update':
      return WaWebhookEventType.ACCOUNT_UPDATE;
    case 'phone_number_quality_update':
      return WaWebhookEventType.PHONE_QUALITY_UPDATE;
    case 'account_review_update':
      return WaWebhookEventType.VERIFICATION_UPDATE;
    case 'security':
      return WaWebhookEventType.SECURITY;
    case 'account_alerts':
      return WaWebhookEventType.ACCOUNT_ALERTS;
    case 'account_settings_update':
      return WaWebhookEventType.ACCOUNT_SETTINGS_UPDATE;
    case 'automatic_events':
      return WaWebhookEventType.AUTOMATIC_EVENTS;
    case 'business_capability_update':
      return WaWebhookEventType.BUSINESS_CAPABILITY_UPDATE;
    case 'business_status_update':
      return WaWebhookEventType.BUSINESS_STATUS_UPDATE;
    case 'business_username_updates':
      return WaWebhookEventType.BUSINESS_USERNAME_UPDATES;
    case 'calls':
      return WaWebhookEventType.CALLS;
    case 'flows':
      return WaWebhookEventType.FLOWS;
    case 'group_lifecycle_update':
      return WaWebhookEventType.GROUP_LIFECYCLE_UPDATE;
    case 'group_participants_update':
      return WaWebhookEventType.GROUP_PARTICIPANTS_UPDATE;
    case 'group_settings_update':
      return WaWebhookEventType.GROUP_SETTINGS_UPDATE;
    case 'group_status_update':
      return WaWebhookEventType.GROUP_STATUS_UPDATE;
    case 'history':
      return WaWebhookEventType.HISTORY;
    case 'message_echoes':
      return WaWebhookEventType.MESSAGE_ECHOES;
    case 'message_template_components_update':
      return WaWebhookEventType.MESSAGE_TEMPLATE_COMPONENTS_UPDATE;
    case 'message_template_quality_update':
      return WaWebhookEventType.MESSAGE_TEMPLATE_QUALITY_UPDATE;
    case 'messaging_handovers':
      return WaWebhookEventType.MESSAGING_HANDOVERS;
    case 'partner_solutions':
      return WaWebhookEventType.PARTNER_SOLUTIONS;
    case 'payment_configuration_update':
      return WaWebhookEventType.PAYMENT_CONFIGURATION_UPDATE;
    case 'phone_number_name_update':
      return WaWebhookEventType.PHONE_NUMBER_NAME_UPDATE;
    case 'smb_app_state_sync':
      return WaWebhookEventType.SMB_APP_STATE_SYNC;
    case 'smb_message_echoes':
      return WaWebhookEventType.SMB_MESSAGE_ECHOES;
    case 'standby':
      return WaWebhookEventType.STANDBY;
    case 'template_category_update':
      return WaWebhookEventType.TEMPLATE_CATEGORY_UPDATE;
    case 'template_correct_category_detection':
      return WaWebhookEventType.TEMPLATE_CORRECT_CATEGORY_DETECTION;
    case 'tracking_events':
      return WaWebhookEventType.TRACKING_EVENTS;
    case 'user_preferences':
      return WaWebhookEventType.USER_PREFERENCES;
    default:
      return WaWebhookEventType.OTHER;
  }
}

function extractPhoneNumberId(change: MetaWebhookChange): string | null {
  const value = change.value ?? {};
  const metadata = value['metadata'] as Record<string, string> | undefined;
  return metadata?.['phone_number_id'] ?? null;
}

function extractMetaTs(change: MetaWebhookChange): Date | null {
  const value = change.value ?? {};
  const messages = value['messages'];
  if (Array.isArray(messages) && messages.length > 0) {
    const ts = (messages[0] as Record<string, string>)['timestamp'];
    if (ts) return new Date(parseInt(ts, 10) * 1000);
  }
  const statuses = value['statuses'];
  if (Array.isArray(statuses) && statuses.length > 0) {
    const ts = (statuses[0] as Record<string, string>)['timestamp'];
    if (ts) return new Date(parseInt(ts, 10) * 1000);
  }
  return null;
}
