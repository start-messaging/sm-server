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

/**
 * Typed dispatch surface for the async worker.
 * Values match Meta `changes[].field` where possible; `messages` is split into
 * inbound vs status. Legacy aliases kept for rows already stored in DB.
 */
export enum WaWebhookEventType {
  // messages field (split)
  MESSAGE_STATUS = 'message_status',
  INBOUND_MESSAGE = 'inbound_message',
  // legacy aliases (stable DB enum values)
  TEMPLATE_STATUS = 'template_status', // message_template_status_update
  ACCOUNT_UPDATE = 'account_update',
  PHONE_QUALITY_UPDATE = 'phone_quality_update', // phone_number_quality_update
  VERIFICATION_UPDATE = 'verification_update', // account_review_update
  SECURITY = 'security',
  // remaining whatsapp_business_account fields (Meta exact names)
  ACCOUNT_ALERTS = 'account_alerts',
  ACCOUNT_SETTINGS_UPDATE = 'account_settings_update',
  AUTOMATIC_EVENTS = 'automatic_events',
  BUSINESS_CAPABILITY_UPDATE = 'business_capability_update',
  BUSINESS_STATUS_UPDATE = 'business_status_update',
  BUSINESS_USERNAME_UPDATES = 'business_username_updates',
  CALLS = 'calls',
  FLOWS = 'flows',
  GROUP_LIFECYCLE_UPDATE = 'group_lifecycle_update',
  GROUP_PARTICIPANTS_UPDATE = 'group_participants_update',
  GROUP_SETTINGS_UPDATE = 'group_settings_update',
  GROUP_STATUS_UPDATE = 'group_status_update',
  HISTORY = 'history',
  MESSAGE_ECHOES = 'message_echoes',
  MESSAGE_TEMPLATE_COMPONENTS_UPDATE = 'message_template_components_update',
  MESSAGE_TEMPLATE_QUALITY_UPDATE = 'message_template_quality_update',
  MESSAGING_HANDOVERS = 'messaging_handovers',
  PARTNER_SOLUTIONS = 'partner_solutions',
  PAYMENT_CONFIGURATION_UPDATE = 'payment_configuration_update',
  PHONE_NUMBER_NAME_UPDATE = 'phone_number_name_update',
  SMB_APP_STATE_SYNC = 'smb_app_state_sync',
  SMB_MESSAGE_ECHOES = 'smb_message_echoes',
  STANDBY = 'standby',
  TEMPLATE_CATEGORY_UPDATE = 'template_category_update',
  TEMPLATE_CORRECT_CATEGORY_DETECTION = 'template_correct_category_detection',
  TRACKING_EVENTS = 'tracking_events',
  USER_PREFERENCES = 'user_preferences',
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
