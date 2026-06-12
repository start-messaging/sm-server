import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Country } from '../../countries/entities/country.entity';
import { WabaAccount } from './waba-account.entity';

/** Meta-set per-number quality (a genuinely closed set → native enum). */
export enum WaQualityRating {
  GREEN = 'green',
  YELLOW = 'yellow',
  RED = 'red',
  UNKNOWN = 'unknown',
}

/** Per-number send-eligibility state machine. */
export enum WaPhoneNumberStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  FLAGGED = 'flagged',
  BANNED = 'banned',
}

/**
 * The sendable unit: one WhatsApp sender number under a WABA. Meta governs
 * `quality_rating` and the daily messaging cap PER NUMBER (not per WABA), so every
 * Phase-6 messaging row routes by `phone_number_id`. `workspace_id` is denormalized
 * for the hot "active senders for this workspace" read.
 *
 * HARDENING DEFERRED to the connect slice (needs a live DB + tests): promote the
 * plain `workspace_id` column to a composite FK (waba_account_id, workspace_id) →
 * waba_accounts(id, workspace_id) so a cross-tenant sender is structurally
 * impossible. Until send logic writes this table the invariant has no live surface;
 * recorded in docs/decisions.md.
 */
@Index('idx_phone_numbers_waba', ['wabaAccountId'])
// Hot path: pick an ACTIVE sender for a workspace in one index hit.
@Index('idx_phone_numbers_workspace_status', ['workspaceId', 'status'], {
  where: 'deleted_at IS NULL',
})
// Plain (full) index incl. soft-deleted: webhook router resolves a retired number
// still receiving delivery/read receipts for already-sent messages.
@Index('idx_phone_numbers_meta_id', ['metaPhoneNumberId'])
@Index('uq_phone_numbers_meta_id', ['metaPhoneNumberId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('uq_phone_numbers_display_e164', ['displayNumberE164'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'phone_numbers' })
export class PhoneNumber extends BaseEntity {
  @Column({ name: 'waba_account_id', type: 'uuid' })
  wabaAccountId!: string;

  @ManyToOne(() => WabaAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount?: WabaAccount;

  /**
   * Denormalized owning tenant for hot workspace-scoped reads. No standalone FK yet
   * — integrity comes from the parent WABA; the connect slice promotes this to a
   * composite FK into waba_accounts(id, workspace_id). See class doc.
   */
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  /** Meta's phone-number id — the routing key in every send/register call. */
  @Column({ name: 'meta_phone_number_id', type: 'varchar', length: 40 })
  metaPhoneNumberId!: string;

  /** E.164 display number, e.g. '+918010012345'. */
  @Column({ name: 'display_number_e164', type: 'varchar', length: 20 })
  displayNumberE164!: string;

  /**
   * SENDER country, derived from the E.164 prefix at connect — display/filter only.
   * NOT the pricing country (Meta prices by DESTINATION, on wa_messages, Phase 6).
   */
  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @ManyToOne(() => Country, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;

  @Column({
    name: 'verified_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  verifiedName!: string | null;

  @Column({
    name: 'quality_rating',
    type: 'enum',
    enum: WaQualityRating,
    enumName: 'wa_quality_rating_enum',
    default: WaQualityRating.UNKNOWN,
  })
  qualityRating!: WaQualityRating;

  /**
   * Meta's per-number daily business-initiated conversation cap as an INT (250 /
   * 1000 / 10000 / 100000…), NOT a brittle named enum — Meta retunes these tiers
   * often, so an int avoids an ALTER TYPE treadmill. Consulted by the rate-limiter.
   */
  @Column({ name: 'messaging_limit_per_day', type: 'int', default: 250 })
  messagingLimitPerDay!: number;

  /** KMS-encrypted two-step re-registration PIN. Never logged or serialized. */
  @Column({
    name: 'registration_pin_encrypted',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  registrationPinEncrypted!: string | null;

  @Column({
    type: 'enum',
    enum: WaPhoneNumberStatus,
    enumName: 'wa_phone_number_status_enum',
    default: WaPhoneNumberStatus.PENDING,
  })
  status!: WaPhoneNumberStatus;

  /**
   * Meta event timestamp of the last applied quality/status/limit webhook —
   * ordering guard so an out-of-order delivery can't regress a newer red → green.
   */
  @Column({ name: 'status_synced_at', type: 'timestamptz', nullable: true })
  statusSyncedAt!: Date | null;

  @Column({ name: 'registered_at', type: 'timestamptz', nullable: true })
  registeredAt!: Date | null;
}
