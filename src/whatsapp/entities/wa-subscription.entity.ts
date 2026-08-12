import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type WaSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'none';

/**
 * CRM SaaS subscription for a workspace. Only tracks Razorpay/Stripe-managed
 * subscriptions — NOT message wallet. One active subscription per workspace.
 */
@Index('idx_wa_subscriptions_workspace', ['workspaceId'])
@Index('uq_wa_subscriptions_workspace', ['workspaceId'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_subscriptions' })
export class WaSubscription extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 20 })
  planCode!: string;

  @Column({ type: 'varchar', length: 20, default: 'none' })
  status!: WaSubscriptionStatus;

  @Column({
    name: 'provider_key',
    type: 'varchar',
    length: 20,
    default: 'razorpay',
  })
  providerKey!: string;

  /** Razorpay or Stripe subscription ID. */
  @Column({
    name: 'provider_subscription_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerSubscriptionId!: string | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;

  @Column({ name: 'trial_end', type: 'timestamptz', nullable: true })
  trialEnd!: Date | null;
}
