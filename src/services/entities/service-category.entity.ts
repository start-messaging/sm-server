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
import { Service } from './service.entity';

/**
 * A pricing/message category within a service (e.g. WhatsApp → marketing,
 * utility, authentication, service). Identified externally by
 * `(serviceKey, key)`; cascade-deleted when its service is removed. Becomes the
 * `pricing_category` axis on rate cards in the pricing slice.
 */
@Index('uq_service_category', ['serviceKey', 'key'], { unique: true })
@Entity({ name: 'service_categories' })
export class ServiceCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'service_key', type: 'varchar', length: 40 })
  serviceKey!: string;

  @ManyToOne(() => Service, (s) => s.categories, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_key', referencedColumnName: 'key' })
  service?: Service;

  /** Lowercase slug, unique within the service, e.g. `marketing`. */
  @Column({ type: 'varchar', length: 40 })
  key!: string;

  @Column({ type: 'varchar', length: 80 })
  label!: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  hint!: string | null;

  @Column({ type: 'smallint', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
