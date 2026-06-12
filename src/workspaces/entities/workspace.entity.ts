import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Country } from '../../countries/entities/country.entity';
import { Plan } from '../../plans/entities/plan.entity';

export enum WorkspaceStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * The business/tenant. Country and currency are locked at creation (derived
 * from the owner's verified mobile) — never updated. Deletion is soft
 * (BaseEntity.deletedAt), so the slug uniqueness is partial like users.email.
 */
@Index('uq_workspaces_slug', ['slug'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'workspaces' })
export class Workspace extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 140 })
  slug!: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @ManyToOne(() => Country, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'country_code', referencedColumnName: 'code' })
  country?: Country;

  @Column({ name: 'default_currency', type: 'char', length: 3 })
  defaultCurrency!: string;

  /** Display timezone — user-set later in settings (countries carry none). */
  @Column({ type: 'varchar', length: 60, nullable: true })
  timezone!: string | null;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan?: Plan;

  @Column({
    type: 'enum',
    enum: WorkspaceStatus,
    enumName: 'workspace_status_enum',
    default: WorkspaceStatus.ACTIVE,
  })
  status!: WorkspaceStatus;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt!: Date | null;

  /** Free-form onboarding context: industry, team_size, use_case. */
  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
