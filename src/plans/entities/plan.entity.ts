import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum PlanStatus {
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  HIDDEN = 'hidden',
}

/**
 * Entitlements are OPEN key-value data, not a fixed schema: new keys are added
 * by seeding/admin-editing plan rows — never by a code change. The server
 * enforces only the keys it registers (see plan-keys.ts); everything else
 * flows to the client, which gates UI off whatever keys exist. An absent
 * feature is OFF; an absent/null limit is UNLIMITED.
 */
export type PlanFeatures = Record<string, boolean | string>;
export type PlanLimits = Record<string, number | null>;

/**
 * Subscription plans — country-agnostic; features and limits ONLY (prices live
 * in the future `plan_pricing` table). `serviceKey` scopes a plan to one
 * service (WhatsApp's GROWTH ≠ SMS's GROWTH); NULL = a global row that applies
 * to any service without its own. Resolution: service-specific row first, then
 * the global fallback. The permanent FREE plan is seeded globally.
 */
@Index('uq_plans_service_code', ['serviceKey', 'code'], {
  unique: true,
  where: 'service_key IS NOT NULL',
})
@Index('uq_plans_global_code', ['code'], {
  unique: true,
  where: 'service_key IS NULL',
})
@Entity({ name: 'plans' })
export class Plan extends BaseEntity {
  @Column({ type: 'varchar', length: 20 })
  code!: string;

  /** Service this plan belongs to; NULL = applies to all services (fallback). */
  @Column({ name: 'service_key', type: 'varchar', length: 40, nullable: true })
  serviceKey!: string | null;

  @Column({ type: 'varchar', length: 60 })
  name!: string;

  /** Numeric tier for ordering / upgrade logic (FREE = 0). */
  @Column({ type: 'int' })
  tier!: number;

  @Column({ type: 'jsonb' })
  features!: PlanFeatures;

  @Column({ type: 'jsonb' })
  limits!: PlanLimits;

  @Column({ name: 'trial_days', type: 'int', default: 0 })
  trialDays!: number;

  @Column({
    type: 'enum',
    enum: PlanStatus,
    enumName: 'plan_status_enum',
    default: PlanStatus.ACTIVE,
  })
  status!: PlanStatus;
}
