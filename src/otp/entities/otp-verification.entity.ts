import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { AuthSubject } from '../../auth-core/auth-subject.enum';

export enum OtpChannel {
  EMAIL = 'email',
  SMS = 'sms',
}

export enum OtpPurpose {
  SIGNUP = 'signup',
  LOGIN_2FA = 'login_2fa',
  PASSWORD_RESET = 'password_reset',
  MOBILE_CHANGE = 'mobile_change',
}

/**
 * Short-lived OTP challenge, polymorphic over the subject (customer or referral
 * partner) so one flow serves both. The raw 6-digit code is never stored — only
 * its Argon2 hash. Kept in Postgres for a durable, auditable record of attempts.
 */
@Index('idx_otp_subject', ['subjectType', 'subjectId'])
@Entity({ name: 'otp_verifications' })
export class OtpVerification extends BaseEntity {
  @Column({ type: 'enum', enum: AuthSubject, enumName: 'otp_subject_enum' })
  subjectType!: AuthSubject;

  @Column({ type: 'uuid' })
  subjectId!: string;

  @Index('uq_otp_verification_token', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  verificationToken!: string;

  @Column({ type: 'varchar' })
  codeHash!: string;

  @Column({
    type: 'enum',
    enum: OtpChannel,
    enumName: 'otp_channel_enum',
    default: OtpChannel.EMAIL,
  })
  channel!: OtpChannel;

  @Column({ type: 'enum', enum: OtpPurpose, enumName: 'otp_purpose_enum' })
  purpose!: OtpPurpose;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
}
