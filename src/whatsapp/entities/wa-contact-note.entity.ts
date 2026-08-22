import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Index('idx_wa_contact_notes_contact', ['workspaceId', 'contactId'])
@Entity({ name: 'wa_contact_notes' })
export class WaContactNote extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'contact_id', type: 'uuid' })
  contactId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'author_user_id', type: 'uuid' })
  authorUserId!: string;
}
