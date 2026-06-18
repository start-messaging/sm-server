import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  VersionColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';

/**
 * The per-workspace prepaid balance (1:1 with a workspace, docs §5.1). The
 * visible balance is a CACHE — `wallet_transactions` is the append-only source
 * of truth; this row is kept in lock-step inside the same transaction as every
 * ledger insert (see `WalletService`).
 *
 * Money is integer **micros** (1 unit = 1,000,000) in the workspace's own
 * currency, which is locked to `workspace.default_currency` and never changes
 * (docs §9 — no FX in the hot path). Unlike per-message rate micros, balances
 * accumulate and can exceed 2^53, so they are kept as `string` end-to-end (the
 * bigint transformer is deliberately NOT used here) and manipulated with
 * `BigInt()` in the service.
 */
@Index('uq_wallets_workspace', ['workspaceId'], { unique: true })
@Entity({ name: 'wallets' })
export class Wallet extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @OneToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  /** Locked to the workspace currency; every ledger row must match it. */
  @Column({ type: 'char', length: 3 })
  currency!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyRef?: Currency;

  /** Cached available balance, micros. String (high-magnitude money). */
  @Column({ name: 'balance_micros', type: 'bigint', default: 0 })
  balanceMicros!: string;

  /** Reserved for in-flight campaigns (Phase 8), micros. */
  @Column({ name: 'held_micros', type: 'bigint', default: 0 })
  heldMicros!: string;

  /** Alert trigger level; null = no alert. */
  @Column({
    name: 'low_balance_threshold_micros',
    type: 'bigint',
    nullable: true,
  })
  lowBalanceThresholdMicros!: string | null;

  @Column({ name: 'auto_recharge_enabled', type: 'boolean', default: false })
  autoRechargeEnabled!: boolean;

  @Column({
    name: 'auto_recharge_amount_micros',
    type: 'bigint',
    nullable: true,
  })
  autoRechargeAmountMicros!: string | null;

  /** Optimistic-lock version (docs §5.1); debits also take a pessimistic lock. */
  @VersionColumn()
  version!: number;
}
