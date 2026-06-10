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
import { Country } from '../../countries/entities/country.entity';
import { Currency } from '../../currencies/entities/currency.entity';
import { bigintTransformer } from '../../common/database/bigint.transformer';
import { Service } from './service.entity';

/**
 * The price of one service in one country for one message category — the
 * "country tier" rate card. Money is integer **micros** in the country's own
 * currency: `providerCostMicros` is what we pay (cost basis), `sellMicros` is
 * what we charge; margin = (sell − cost) / sell is derived in the UI. Both are
 * nullable so an "added but not-yet-priced" cell can exist.
 *
 * Business key is the triple `(serviceKey, countryCode, categoryKey)`; the uuid
 * is a surrogate. `categoryKey` is the `service_categories.key` slug *within
 * this service* — integrity is enforced in the service layer (categories' own
 * natural key is composite, so there is no standalone FK target).
 *
 * onDelete: the service FK **cascades** (rates are operator pricing config, no
 * billing history references them yet, and services are hard-deleted today).
 * FLIP THIS TO RESTRICT / soft-delete once usage or invoices reference a rate —
 * otherwise deleting a service would silently destroy priced history.
 *
 * A later per-workspace/client override tier is a *separate table* resolved by a
 * precedence chain (workspace → country) at read time. There is NO global tier —
 * this row is the base of that chain and stays a flat lookup.
 */
@Index(
  'uq_service_country_rate',
  ['serviceKey', 'countryCode', 'categoryKey'],
  {
    unique: true,
  },
)
@Entity({ name: 'service_country_rates' })
export class ServiceCountryRate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_key', type: 'varchar', length: 40 })
  serviceKey!: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
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

  /** Denormalised from the country's currency at write time. */
  @Column({ type: 'char', length: 3 })
  currency!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency', referencedColumnName: 'code' })
  currencyRef?: Currency;

  /** What we pay the provider, in micros. Null = cost not yet set. */
  @Column({
    name: 'provider_cost_micros',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  providerCostMicros!: number | null;

  /** What we charge clients, in micros. Null = sell not yet set. */
  @Column({
    name: 'sell_micros',
    type: 'bigint',
    nullable: true,
    transformer: bigintTransformer,
  })
  sellMicros!: number | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
