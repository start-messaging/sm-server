import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Browser FCM registration token for a customer user.
 * One row per device/browser; upserted on enable, removed on logout/revoke.
 */
@Index('uq_fcm_web_tokens_token', ['token'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Index('idx_fcm_web_tokens_user', ['userId'])
@Entity({ name: 'fcm_web_tokens' })
export class FcmWebToken extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  /** FCM registration token from the web SDK (getToken). */
  @Column({ type: 'text' })
  token!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent!: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt!: Date;
}
