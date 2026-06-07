import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum UserStatus {
  PENDING_VERIFICATION = 'pending_verification',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

/**
 * A person who can log in. Pure identity — no business data hangs off it yet
 * (that lives on workspaces, added in a later slice). One row per email among
 * non-deleted rows; soft-deletable so an email can be reused later.
 */
@Index('uq_users_email', ['email'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
// One account per VERIFIED phone; unverified/null numbers don't collide.
@Index('uq_users_mobile', ['mobileE164'], {
  unique: true,
  where: 'mobile_verified = true AND deleted_at IS NULL',
})
@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  /** Argon2id hash. Null only for invited-but-not-yet-accepted users (future slice). */
  @Column({ type: 'varchar', nullable: true })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 120 })
  fullName!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  mobileE164!: string | null;

  @Column({ type: 'boolean', default: false })
  mobileVerified!: boolean;

  /** ISO 3166-1 alpha-2. Soft reference to countries (no FK yet). */
  @Column({ type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  locale!: string | null;

  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status_enum',
    default: UserStatus.PENDING_VERIFICATION,
  })
  status!: UserStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;
}
