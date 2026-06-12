import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WabaAccount } from './waba-account.entity';

/** Typed dispatch surface for the async worker. */
export enum WaWebhookEventType {
  MESSAGE_STATUS = 'message_status',
  INBOUND_MESSAGE = 'inbound_message',
  TEMPLATE_STATUS = 'template_status',
  ACCOUNT_UPDATE = 'account_update',
  PHONE_QUALITY_UPDATE = 'phone_quality_update',
  VERIFICATION_UPDATE = 'verification_update',
  SECURITY = 'security',
  OTHER = 'other',
}

export enum WaWebhookEventStatus {
  PENDING = 'pending',
  PROCESSED = 'processed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}

/**
 * Append-only webhook ingestion + idempotency + replay log at the edge. The connect
 * slice already receives account-update, phone-quality and verification webhooks
 * (at-least-once, out-of-order), so this lands in Phase 5 and is reused unchanged by
 * Phase-6 messaging. The controller verifies X-Hub-Signature-256, INSERTs the
 * verified envelope keyed by a provider-stable `dedup_key`, 200s fast, and an async
 * worker processes it — decoupling Meta's burst rate from any business write. A
 * Redis SETNX(dedup_key, TTL) fast-path fronts the unique index, so the index is a
 * durable backstop, not the per-request serialization point.
 *
 * Deliberately does NOT extend BaseEntity (no updated_at/deleted_at churn on the
 * hottest table); retention is age-out/DROP, not softRemove. Unpartitioned today
 * with a real global UNIQUE(dedup_key); range-partitioning by received_at is a
 * documented future ops step (which moves dedup to Redis + a small dedup table).
 */
@Index('idx_wa_webhook_events_status', ['status', 'receivedAt'])
@Index('idx_wa_webhook_events_waba', ['wabaAccountId', 'receivedAt'])
@Index('idx_wa_webhook_events_event_type', ['eventType', 'receivedAt'])
@Index('uq_wa_webhook_events_dedup', ['dedupKey'], { unique: true })
@Entity({ name: 'wa_webhook_events' })
export class WaWebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'provider_key', type: 'varchar', length: 40 })
  providerKey!: string;

  @Column({
    name: 'event_type',
    type: 'enum',
    enum: WaWebhookEventType,
    enumName: 'wa_webhook_event_type_enum',
  })
  eventType!: WaWebhookEventType;

  /**
   * Provider-stable idempotency key for THIS delivery, e.g.
   * `wamid:<wamid>:<status>` or `verif:<waba>:<status>:<meta_ts>`. Globally UNIQUE —
   * the durable edge moat. Distinct from the Phase-4 wallet idempotency key.
   */
  @Column({ name: 'dedup_key', type: 'varchar', length: 200 })
  dedupKey!: string;

  /** Resolved owning WABA when derivable; soft (SET NULL) so a late/unknown event still lands. */
  @Column({ name: 'waba_account_id', type: 'uuid', nullable: true })
  wabaAccountId!: string | null;

  @ManyToOne(() => WabaAccount, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount?: WabaAccount | null;

  /** Raw Meta phone-number id from the payload (not our uuid) — no join at ingest. */
  @Column({
    name: 'meta_phone_number_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  metaPhoneNumberId!: string | null;

  /** Meta's own event timestamp — feeds the per-target monotonic ordering guards. */
  @Column({ name: 'meta_event_ts', type: 'timestamptz', nullable: true })
  metaEventTs!: Date | null;

  /** When we accepted the delivery — the natural time-order / future partition key. */
  @CreateDateColumn({ name: 'received_at', type: 'timestamptz' })
  receivedAt!: Date;

  @Column({
    type: 'enum',
    enum: WaWebhookEventStatus,
    enumName: 'wa_webhook_event_status_enum',
    default: WaWebhookEventStatus.PENDING,
  })
  status!: WaWebhookEventStatus;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** Full raw verified webhook envelope — source of truth for replay (bounded retention). */
  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;
}
