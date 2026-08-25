import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * A workspace-scoped API key for the public outbound trigger endpoint.
 *
 * Only the digest is persisted — the raw key is shown once, at creation, and
 * is unrecoverable afterwards. `keyPrefix` is the safe-to-display fragment the
 * Settings UI lists so a customer can tell their keys apart before revoking.
 */
@Index('idx_wa_api_keys_workspace', ['workspaceId'])
@Index('idx_wa_api_keys_prefix', ['keyPrefix'])
@Index('uq_wa_api_keys_hash', ['keyHash'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_api_keys' })
export class WaApiKey extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 80 })
  name!: string;

  /** SHA-256 digest of the raw key — the raw key is NEVER stored. */
  @Column({ name: 'key_hash', type: 'varchar', length: 120 })
  keyHash!: string;

  /** First 12 chars of the raw key, e.g. `sm_live_ab12`. */
  @Column({ name: 'key_prefix', type: 'varchar', length: 20 })
  keyPrefix!: string;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}
