import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Wallet } from './wallet.entity';

/** Direction of a ledger row; the amount is always positive (docs §5.2). */
export enum WalletTxType {
  CREDIT = 'credit',
  DEBIT = 'debit',
  HOLD = 'hold',
  RELEASE = 'release',
  REFUND = 'refund',
}

/**
 * Business reason for a row. A varchar (not a DB enum) so new reasons can be
 * added without a schema migration; the service validates against this list.
 */
export enum WalletTxSubType {
  MESSAGE_CHARGE = 'message_charge',
  RECHARGE = 'recharge',
  SIGNUP_BONUS = 'signup_bonus',
  CAMPAIGN_HOLD = 'campaign_hold',
  CAMPAIGN_RELEASE = 'campaign_release',
  REFUND = 'refund',
  REFERRAL_BONUS = 'referral_bonus',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
}

/**
 * The append-only money ledger (docs §5.2). One immutable row per monetary
 * event — never UPDATEd, only compensated by a later row. Deliberately does
 * NOT extend BaseEntity: there is no `updatedAt`/`deletedAt` on an immutable
 * record. The UNIQUE `idempotency_key` is the real safety guarantee — a Meta
 * webhook retry or a campaign restart that reuses the key hits the constraint
 * and the transaction rolls back (see `WalletService.applyTxn`).
 *
 * Money is integer micros, kept as `string` (high-magnitude) to match wallets.
 */
@Index('uq_wallet_tx_idempotency', ['idempotencyKey'], { unique: true })
@Index('idx_wallet_tx_wallet', ['walletId', 'createdAt'])
@Entity({ name: 'wallet_transactions' })
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => Wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: Wallet;

  @Column({
    type: 'enum',
    enum: WalletTxType,
    enumName: 'wallet_tx_type_enum',
  })
  type!: WalletTxType;

  @Column({ name: 'sub_type', type: 'varchar', length: 40 })
  subType!: WalletTxSubType;

  /** Always positive; the direction comes from `type`. */
  @Column({ name: 'amount_micros', type: 'bigint' })
  amountMicros!: string;

  /** Balance snapshot AFTER applying this row — the running ledger total. */
  @Column({ name: 'balance_after_micros', type: 'bigint' })
  balanceAfterMicros!: string;

  /** Held snapshot AFTER applying this row. */
  @Column({ name: 'held_after_micros', type: 'bigint' })
  heldAfterMicros!: string;

  @Column({ type: 'char', length: 3 })
  currency!: string;

  /** What the row points at: message | campaign | payment | promotion | referral | manual. */
  @Column({
    name: 'reference_type',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  referenceType!: string | null;

  @Column({
    name: 'reference_id',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  referenceId!: string | null;

  /** e.g. 'wamid.xxx:sent' — prevents double-processing. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey!: string;

  /** Pricing category, destination country, provider cost — audit only. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
