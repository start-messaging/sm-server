import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { WaContact } from './wa-contact.entity';

@Index('idx_wa_conversations_workspace', ['workspaceId'])
@Index('uq_wa_conversations_workspace_phone', ['workspaceId', 'contactPhone'], {
  unique: true,
  where: 'deleted_at IS NULL',
})
@Entity({ name: 'wa_conversations' })
export class WaConversation extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'contact_id', type: 'uuid', nullable: true })
  contactId!: string | null;

  @ManyToOne(() => WaContact, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contact_id' })
  contact?: WaContact | null;

  @Column({
    name: 'contact_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  contactName!: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', length: 20 })
  contactPhone!: string;

  /** ISO timestamp of the customer's last inbound message — drives 24h window. */
  @Column({ name: 'last_inbound_at', type: 'timestamptz', nullable: true })
  lastInboundAt!: Date | null;

  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount!: number;

  /** Cached snippet of the latest message for conversation list. */
  @Column({ name: 'last_message_body', type: 'text', nullable: true })
  lastMessageBody!: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;
}
