import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { WaConversation } from './wa-conversation.entity';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageMediaType =
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker';

export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'template'
  | 'interactive_button'
  | 'interactive_list'
  | 'interactive_reply';

export interface InteractiveData {
  interactiveType?: 'button' | 'list' | 'button_reply' | 'list_reply';
  body?: string;
  buttons?: Array<{ id: string; title: string }>;
  sections?: Array<{
    title?: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>;
  replyId?: string;
  replyTitle?: string;
}

@Index('idx_wa_messages_conversation', ['conversationId', 'timestamp'])
@Index('idx_wa_messages_workspace', ['workspaceId'])
@Index('uq_wa_messages_wamid', ['metaMessageId'], {
  unique: true,
  where: 'meta_message_id IS NOT NULL AND deleted_at IS NULL',
})
@Index('idx_wa_messages_campaign', ['campaignId'], {
  where: 'campaign_id IS NOT NULL',
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

  /** FK to wa_campaigns for campaign-sourced outbound messages. */
  @Column({ name: 'campaign_id', type: 'uuid', nullable: true })
  campaignId!: string | null;

  /** Meta Graph / webhook error code when status is failed (e.g. 131049). */
  @Column({ name: 'failure_code', type: 'int', nullable: true })
  failureCode!: number | null;

  /** Human-readable failure detail from Meta (title or error_data.details). */
  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  // ── Media fields ────────────────────────────────────────────────────────────

  /** Media type; null for text and template messages. */
  @Column({
    name: 'media_type',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  mediaType!: MessageMediaType | null;

  /**
   * Cloudflare R2 object key (e.g. `wa/{workspaceId}/{conversationId}/{wamid}`).
   * Public URL = `${R2_PUBLIC_URL}/${mediaR2Key}`.
   */
  @Column({ name: 'media_r2_key', type: 'text', nullable: true })
  mediaR2Key!: string | null;

  /** Full public URL of the media in R2 (set when R2_PUBLIC_URL is configured). */
  @Column({ name: 'media_url', type: 'text', nullable: true })
  mediaUrl!: string | null;

  /** MIME type reported by Meta or the uploader (e.g. `image/jpeg`). */
  @Column({ name: 'media_mime', type: 'varchar', length: 128, nullable: true })
  mediaMime!: string | null;

  /** Original filename (mainly for document messages). */
  @Column({
    name: 'media_filename',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  mediaFilename!: string | null;

  /** Structured message type — covers interactive subtypes. */
  @Column({
    name: 'message_type',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  messageType!: MessageType | null;

  /** Full interactive payload (sent or received) for re-rendering without hitting Meta. */
  @Column({ name: 'interactive_data', type: 'jsonb', nullable: true })
  interactiveData!: InteractiveData | null;

  /** UUID of the workspace member who sent this message (outbound only; null for automated/campaign sends). */
  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId!: string | null;
}
