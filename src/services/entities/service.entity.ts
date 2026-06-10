import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ServiceCategory } from './service-category.entity';

export enum ServiceStatus {
  /** Live and sellable. */
  ACTIVE = 'active',
  /** Available but still being stabilised. */
  BETA = 'beta',
  /** Announced, not yet integrated. */
  COMING_SOON = 'coming_soon',
}

/**
 * A messaging channel the platform sells (the "service catalogue"). The natural
 * `key` slug (e.g. `whatsapp`) is the primary key — it's what rate cards will
 * reference as `channel`. Admin-managed via full CRUD. Per-service message
 * categories live in `service_categories` (cascade-deleted with the service).
 */
@Entity({ name: 'services' })
export class Service {
  /** Lowercase slug, e.g. `whatsapp`, `sms`. Immutable once created. */
  @PrimaryColumn({ type: 'varchar', length: 40 })
  key!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** Short label for the card icon, e.g. `WABA`. */
  @Column({ type: 'varchar', length: 16 })
  short!: string;

  /** Upstream provider, e.g. `Meta Cloud API`. Null for unlaunched channels. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  provider!: string | null;

  @Column({ type: 'varchar', length: 240, nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: ServiceStatus,
    enumName: 'service_status_enum',
    default: ServiceStatus.COMING_SOON,
  })
  status!: ServiceStatus;

  @OneToMany(() => ServiceCategory, (c) => c.service)
  categories!: ServiceCategory[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
