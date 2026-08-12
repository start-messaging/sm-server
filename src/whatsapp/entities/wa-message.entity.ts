import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { WaConversation } from './wa-conversation.entity';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

@Index('idx_wa_messages_conversation', ['conversationId', 'timestamp'])
@Index('idx_wa_messages_workspace', ['workspaceId'])
@Index('uq_wa_messages_wamid', ['metaMessageId'], {
  unique: true,
  where: 'meta_message_id IS NOT NULL AND deleted_at IS NULL',
})
@Entity({ name: 'wa_messages' })
export class WaMessage extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @ManyToOne(() => WaConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation?: WaConversation;

  @Column({ type: 'varchar', length: 10 })
  direction!: MessageDirection;

  @Column({ type: 'varchar', length: 12, default: 'queued' })
  status!: MessageStatus;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({
    name: 'template_name',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  templateName!: string | null;

  /** Meta's wamid — for dedup and status-update correlation. */
  @Column({
    name: 'meta_message_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  metaMessageId!: string | null;
}
