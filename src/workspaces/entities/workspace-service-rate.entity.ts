import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../common/database/bigint.transformer';
import { Country } from '../../countries/entities/country.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { Service } from '../../services/entities/service.entity';
import { Workspace } from './workspace.entity';

/** Hard cap on rungs per (workspace, service, country, category) ladder. */
export const MAX_LADDER_RUNGS = 10;

/**
 * Workspace-tier pricing override — the UNIFIED LADDER. One row = one volume
 * rung; all rows sharing (workspace, service, country, category) together ARE
 * that cell's ladder, and a flat negotiated rate is simply a one-rung ladder at
 * `minQty 0` (the first rung MUST start at 0 — enforced at the API edge — so an
 * overridden cell always matches some rung; partial coverage never falls back
 * mid-ladder). Rung ranges are structural: a rung applies while
 * `monthlyVolume >= minQty` and below the next rung's `minQty`.
 *
 * Resolution (Phase 4/6, not built yet): pick the workspace rung with the
 * largest `minQty <= monthly volume` for the destination (country, category);
 * if the cell has no ladder, fall through to `service_country_rates` — strictly
 * two tiers, no global, no plan tier (docs/decisions.md).
 *
 * There is deliberately NO `providerCostMicros` here: what we pay the provider
 * does not vary per customer — margin per rung is computed in the UI against
 * the country base row's cost, so a base-cost change never leaves stale copies.
 * `currency` is denormalised from the country at write time like the base
 * table. `minQty` is a plain int (caps ~2.1B msgs/month — fine).
 *
 * Lifecycle mirrors `service_country_rates`: hard delete, no soft-delete (a
 * cleared override has no history to keep yet). FLIP both tables to
 * RESTRICT/soft-archive together once usage or invoices reference rates.
 */
@Index(
  'uq_workspace_service_rate',
  ['workspaceId', 'serviceKey', 'countryCode', 'categoryKey', 'minQty'],
  { unique: true },
)
@Index('idx_workspace_service_rate_ws', ['workspaceId', 'serviceKey'])
@Entity({ name: 'workspace_service_rates' })
export class WorkspaceServiceRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace?: Workspace;

  @Column({ name: 'service_key', type: 'varchar', length: 40 })
  serviceKey!: string;

  @ManyToOne(() => Service, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_key', referencedColumnName: 'key' })
  service?: Service;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @ManyToOne(() => Country, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;

  /** The `service_categories.key` slug within this service (app-enforced). */
  @Column({ name: 'category_key', type: 'varchar', length: 40 })
  categoryKey!: string;

  /** Monthly-volume threshold this rung starts at. First rung is always 0. */
  @Column({ name: 'min_qty', type: 'int' })
  minQty!: number;

  /** What this workspace pays per message at this rung, in micros. NOT NULL —
   *  "no override" is expressed by the cell having no rows at all. */
  @Column({
    name: 'sell_micros',
    type: 'bigint',
    transformer: bigintTransformer,
  })
  sellMicros!: number;

  /** Denormalised from the country's currency at write time. */
  @Column({ type: 'char', length: 3 })
  currency!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyRef?: Currency;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
