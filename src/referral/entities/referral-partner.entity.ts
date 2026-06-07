import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum ReferralPartnerStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * A referral partner — a separate identity from customer `users`, with its own
 * login/register and (later) a referral dashboard. Codes, tracking, and reward
 * payouts are added in a later slice.
 */
@Index('uq_referral_partners_email', ['email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'referral_partners' })
export class ReferralPartner extends BaseEntity {
  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ type: 'varchar' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobileE164!: string | null;

  @Column({ type: 'boolean', default: false })
  mobileVerified!: boolean;

  @Column({
    type: 'enum',
    enum: ReferralPartnerStatus,
    enumName: 'referral_partner_status_enum',
    default: ReferralPartnerStatus.PENDING_VERIFICATION,
  })
  status!: ReferralPartnerStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
