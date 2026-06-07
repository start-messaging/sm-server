import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PlatformRole } from '../enums/platform-role.enum';

export enum StaffStatus {
  /** Invited but hasn't set a password yet — cannot log in. */
  INVITED = 'invited',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * Internal platform staff — a dedicated identity, separate from `users`. Staff
 * never self-register: a SUPER_ADMIN invites them, and they set their own
 * password via the invite token. `passwordHash` is null until the invite is
 * accepted.
 */
@Index('uq_platform_staff_email', ['email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'platform_staff' })
export class PlatformStaff extends BaseEntity {
  @Column({ type: 'citext' })
  email!: string;

  /** Argon2id hash. Null until the staff member accepts their invite. */
  @Column({ type: 'varchar', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 120 })
  fullName!: string;

  @Column({
    type: 'enum',
    enum: PlatformRole,
    enumName: 'platform_role_enum',
  })
  platformRole!: PlatformRole;

  @Column({
    type: 'enum',
    enum: StaffStatus,
    enumName: 'staff_status_enum',
    default: StaffStatus.ACTIVE,
  })
  status!: StaffStatus;

  /** SHA-256 of the one-time invite token; cleared once accepted. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  inviteTokenHash!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  inviteExpiresAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
