import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Currency } from '../../currencies/entities/currency.entity';

/**
 * An ISO 3166-1 country. Reference data: the alpha-2 code (e.g. `IN`) is the
 * primary key and the FK other tables (`plan_pricing`, `rate_cards`) point at.
 *
 * `dialCode` is for display/grouping only — it is NOT unique (`+1` is US and CA
 * and ~20 more), so deriving a country from a phone number must use a real
 * E.164 parser (libphonenumber) at registration, not a dial-code lookup.
 *
 * `currencyCode` is the country's default currency; a workspace locks its
 * currency from this at signup (doc §9.1). The RESTRICT FK stops a currency
 * being deleted while a country still references it.
 */
@Index('idx_countries_dial_code', ['dialCode'])
@Entity({ name: 'countries' })
export class Country {
  /** ISO 3166-1 alpha-2, uppercase (e.g. `IN`, `US`). */
  @PrimaryColumn({ type: 'char', length: 2 })
  code!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** E.164 calling code with leading `+`, e.g. `+91`. Not unique. */
  @Column({ type: 'varchar', length: 8 })
  dialCode!: string;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @ManyToOne(() => Currency, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'currency_code', referencedColumnName: 'code' })
  currency?: Currency;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
