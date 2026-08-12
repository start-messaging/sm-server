import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Index('idx_wa_contacts_workspace', ['workspaceId'])
@Index('uq_wa_contacts_workspace_phone', ['workspaceId', 'phoneE164'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_contacts' })
export class WaContact extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  name!: string | null;

  @Column({ name: 'phone_e164', type: 'varchar', length: 20 })
  phoneE164!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  tags!: string[];

  @Column({ name: 'opted_in', type: 'boolean', default: true })
  optedIn!: boolean;
}
