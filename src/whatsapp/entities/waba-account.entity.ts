import { Exclude } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Service } from '../../services/entities/service.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';

/** Meta business verification — a distinct axis from connection `status`. */
export enum WabaVerificationStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

/** Connection-health state machine (separate from soft-delete + verification). */
export enum WabaAccountStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DISCONNECTED = 'disconnected',
}

/**
 * Root of the WhatsApp vertical: one connected WhatsApp Business Account per row,
 * owned by a workspace. Persisted in the single connect transaction at the end of
 * Embedded Signup (token-exchange → getWaba → subscribeApp), which also flips the
 * `workspace_services` spine row to `active`. Parent of `phone_numbers` (and, from
 * Phase 6, `wa_templates`).
 *
 * `verification_status` lives HERE (2026-06-13 decision — pruned from `workspaces`);
 * it is a separate axis from `status` (connection health) and from `deletedAt`
 * (soft-delete = disconnect-and-keep-history, which is why the meta_waba_id unique
 * is partial — a disconnected WABA can be re-onboarded). The access token is stored
 * only as KMS ciphertext and is never serialized.
 *
 * HARDENING DEFERRED to the connect slice (needs a live DB + tests): a composite
 * unique (id, workspace_id) here as the FK target, plus a composite FK
 * (workspace_id, service_key) → workspace_services(workspace_id, service_key) to
 * prove spine coherence. Until connect logic writes these tables, the invariant has
 * no live surface, so it is recorded in docs/decisions.md rather than scaffolded.
 */
@Index('idx_waba_accounts_workspace', ['workspaceId'])
@Index('idx_waba_accounts_status', ['status'], { where: 'deleted_at IS NULL' })
// Plain (full) index incl. soft-deleted rows: the webhook router must resolve a
// meta_waba_id even for a disconnected account still receiving late events.
@Index('idx_waba_accounts_meta_waba_id', ['metaWabaId'])
// One LIVE attachment per Meta WABA globally; re-onboard-friendly (partial).
@Index('uq_waba_accounts_meta_waba_id', ['metaWabaId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'waba_accounts' })
export class WabaAccount extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  /** Always 'whatsapp' today; pins the WABA to the neutral spine. */
  @Column({ name: 'service_key', type: 'varchar', length: 40 })
  serviceKey!: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_key', referencedColumnName: 'key' })
  service?: Service;

  /**
   * Which provider routes this WABA, e.g. 'meta_cloud'. The connection record is
   * the sole home for routing — the `workspace_services` spine carries none.
   */
  @Column({ name: 'provider_key', type: 'varchar', length: 40 })
  providerKey!: string;

  /** Meta's WABA id — the natural key used in every Graph API call. */
  @Column({ name: 'meta_waba_id', type: 'varchar', length: 40 })
  metaWabaId!: string;

  @Column({
    name: 'meta_business_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  metaBusinessId!: string | null;

  @Column({
    name: 'business_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  businessName!: string | null;

  /** KMS-encrypted long-lived system-user token. Never serialized in a DTO. */
  @Exclude()
  @Column({ name: 'access_token_encrypted', type: 'text' })
  accessTokenEncrypted!: string;

  /** Null = non-expiring system-user token; else drives a refresh/alert job. */
  @Column({ name: 'token_expires_at', type: 'timestamptz', nullable: true })
  tokenExpiresAt!: Date | null;

  /** Did POST /{waba}/subscribed_apps succeed? Flipped true in the connect tx. */
  @Column({ name: 'webhook_subscribed', type: 'boolean', default: false })
  webhookSubscribed!: boolean;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: WabaVerificationStatus,
    enumName: 'waba_verification_status_enum',
    default: WabaVerificationStatus.UNVERIFIED,
  })
  verificationStatus!: WabaVerificationStatus;

  @Column({
    type: 'enum',
    enum: WabaAccountStatus,
    enumName: 'waba_account_status_enum',
    default: WabaAccountStatus.ACTIVE,
  })
  status!: WabaAccountStatus;

  /**
   * Meta event timestamp of the last applied verification update — ordering guard:
   * apply an incoming update only when its timestamp is newer, so a late/stale
   * at-least-once webhook can't regress verified → pending.
   */
  @Column({
    name: 'verification_synced_at',
    type: 'timestamptz',
    nullable: true,
  })
  verificationSyncedAt!: Date | null;

  /**
   * Meta's account-review result for the WABA (separate from number-level name
   * review). Populated at connect and kept current by `account_review_update`
   * webhooks. Values: 'PENDING' | 'APPROVED' | 'REJECTED' | null.
   */
  @Column({
    name: 'account_review_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  accountReviewStatus!: string | null;

  /**
   * Meta Business Manager verification state for the business that owns this WABA.
   * Values mirror Graph API: 'not_verified' | 'pending' | 'verified' | 'rejected'.
   */
  @Column({
    name: 'business_verification_status',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  businessVerificationStatus!: string | null;

  /**
   * Whether Meta has confirmed a valid payment method on the WABA.
   * null = unknown (never received a payment_configuration_update webhook yet).
   * false = no payment method — template sends will be blocked by Meta.
   * true  = payment method present and active.
   */
  @Column({ name: 'meta_payment_ready', type: 'boolean', nullable: true })
  metaPaymentReady!: boolean | null;

  /**
   * True when Meta's `account_alerts` webhook fires with `BUSINESS_INITIATED`
   * channel enabled — i.e. the number has the Official Business Account badge.
   */
  @Column({ name: 'is_official_business', type: 'boolean', default: false })
  isOfficialBusiness!: boolean;

  /**
   * Bounded, audit-only snapshot of Meta's connect response. Never a query/filter
   * target — this is NOT the removed open-config blob (waba_accounts is
   * low-cardinality, one row per connected WABA).
   */
  @Column({ name: 'raw_metadata', type: 'jsonb', nullable: true })
  rawMetadata!: Record<string, unknown> | null;
}
