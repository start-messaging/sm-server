import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An ISO 4217 currency. Reference data: the natural code (e.g. `USD`) is the
 * primary key — it is the FK that money rows (`plan_pricing`, `rate_cards`,
 * wallets) point at, so a surrogate uuid would only add a join.
 *
 * Reference data is never hard-deleted (money rows reference it forever); it is
 * deactivated via `isActive`, and a RESTRICT FK from `countries` enforces that.
 * `decimalPlaces` drives display only — storage is always integer micros.
 */
@Entity({ name: 'currencies' })
export class Currency {
  /** ISO 4217 alpha code, uppercase (e.g. `USD`, `INR`). */
  @PrimaryColumn({ type: 'char', length: 3 })
  code!: string;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** Display symbol, e.g. `$`, `₹`, `د.إ`. */
  @Column({ type: 'varchar', length: 8 })
  symbol!: string;

  /** Fraction digits for display (JPY 0, USD/INR 2, KWD 3). Storage is micros. */
  @Column({ type: 'smallint', default: 2 })
  decimalPlaces!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
