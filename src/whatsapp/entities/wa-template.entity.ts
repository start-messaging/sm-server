import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { WabaAccount } from './waba-account.entity';

export type TemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED';

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

/**
 * Which advanced template family this row belongs to. Derived from the
 * submitted payload on create and re-derived from Meta's `components` on sync,
 * so it stays correct even for templates authored in WhatsApp Manager.
 */
export type TemplateSubtype =
  | 'standard'
  | 'lto'
  | 'authentication'
  | 'carousel';

export type TemplateButtonType =
  | 'QUICK_REPLY'
  | 'URL'
  | 'PHONE_NUMBER'
  | 'COPY_CODE'
  | 'REQUEST_CONTACT_INFO'
  | 'OTP'
  | 'FLOW'
  | 'VOICE_CALL'
  | 'VIDEO_CALL'
  | 'CATALOG'
  | 'MPM'
  | 'POSTBACK'
  | 'BOOKING_STATUS'
  | 'PAYMENT_REQUEST';

export type TemplateFlowIcon = 'DOCUMENT' | 'PROMOTION' | 'REVIEW';

/** One button inside a BUTTONS component (Graph create payload). */
export interface TemplateButton {
  type: TemplateButtonType;
  /** Absent for COPY_CODE / REQUEST_CONTACT_INFO — Meta fixes those labels. */
  text?: string;
  url?: string;
  /**
   * URL: the {{1}} suffix sample only, e.g. `["summer2023"]`.
   * COPY_CODE: the coupon sample as a bare string, e.g. `"250FF"`.
   */
  example?: string | string[];
  phone_number?: string;
  /** OTP buttons (authentication templates) only. */
  otp_type?: 'ONE_TAP' | 'COPY_CODE' | 'ZERO_TAP';
  autofill_text?: string;
  /** ONE_TAP / ZERO_TAP: the Android app allowed to autofill the code. */
  supported_apps?: Array<{ package_name: string; signature_hash: string }>;
  /** FLOW — WhatsApp Flow id from Manager / our meta-flows sync. */
  flow_id?: string;
  flow_action?: 'NAVIGATE' | 'DATA_EXCHANGE';
  navigate_screen?: string;
  icon?: TemplateFlowIcon;
  /** VOICE_CALL / VIDEO_CALL — how long the button stays tappable, max 43200 (30 days). */
  ttl_minutes?: number;
}

export type TemplateComponentType =
  | 'HEADER'
  | 'BODY'
  | 'FOOTER'
  | 'BUTTONS'
  | 'LIMITED_TIME_OFFER'
  | 'CAROUSEL';

/** One card of a CAROUSEL component — its own mini component tree. */
export interface TemplateCarouselCard {
  components: TemplateComponent[];
}

export interface TemplateComponent {
  type: TemplateComponentType;
  text?: string;
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  /**
   * HEADER format IMAGE/VIDEO/DOCUMENT only: publicly-accessible media URL,
   * passed through to Meta unchanged. See open issue in create-template.dto.ts
   * — Meta's real API may require example.header_handle instead.
   */
  link?: string;
  /** Required by Meta when text contains {{n}} variables. */
  example?: {
    body_text?: string[][];
    header_text?: string[];
    header_text_named_params?: Array<{ param_name: string; example: string }>;
    body_text_named_params?: Array<{ param_name: string; example: string }>;
    /** Media header / carousel card header: uploaded asset handle. */
    header_handle?: string[];
  };
  /** BUTTONS component only. */
  buttons?: TemplateButton[];
  /** LIMITED_TIME_OFFER component only. */
  limited_time_offer?: { text: string; has_expiration?: boolean };
  /** CAROUSEL component only — 2–10 cards, fixed at creation time. */
  cards?: TemplateCarouselCard[];
  /** AUTHENTICATION BODY only: appends Meta's "do not share this code" line. */
  add_security_recommendation?: boolean;
  /** AUTHENTICATION FOOTER only: appends Meta's code-expiry warning. */
  code_expiration_minutes?: number;
}

@Index('idx_wa_templates_waba', ['wabaAccountId'])
@Index('idx_wa_templates_workspace', ['workspaceId'])
@Index(
  'uq_wa_templates_waba_name_lang',
  ['wabaAccountId', 'name', 'language'],
  {
    unique: true,
    where: 'deleted_at IS NULL',
  },
)
@Entity({ name: 'wa_templates' })
export class WaTemplate extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ name: 'waba_account_id', type: 'uuid' })
  wabaAccountId!: string;

  @ManyToOne(() => WabaAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'waba_account_id' })
  wabaAccount?: WabaAccount;

  @Column({ type: 'varchar', length: 512 })
  name!: string;

  @Column({ type: 'varchar', length: 10 })
  language!: string;

  /** Current Meta category (source of truth after sync / category webhooks). */
  @Column({ type: 'varchar', length: 20 })
  category!: TemplateCategory;

  /** Category we submitted at create time. Used to detect Meta recategorization. */
  @Column({
    name: 'submitted_category',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  submittedCategory!: TemplateCategory | null;

  /**
   * Impending Meta category when `correct_category` ≠ `category`.
   * Null when the live category already matches Meta's correction.
   */
  @Column({
    name: 'correct_category',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  correctCategory!: TemplateCategory | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: TemplateStatus;

  @Column({ type: 'jsonb', default: '[]' })
  components!: TemplateComponent[];

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  /** Meta's template id — used for Graph API delete calls. */
  @Column({
    name: 'meta_template_id',
    type: 'varchar',
    length: 60,
    nullable: true,
  })
  metaTemplateId!: string | null;

  /**
   * Meta's quality signal for this template: 'HIGH' | 'MEDIUM' | 'LOW'.
   * Updated by `message_template_quality_update` webhooks. Null until Meta
   * has sent the first quality event (new templates start without a score).
   */
  @Column({
    name: 'quality_score',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  qualityScore!: string | null;

  /**
   * Denormalised `buttons.length > 0` so list views can badge templates
   * without deserialising the components tree.
   */
  @Column({ name: 'has_buttons', type: 'boolean', default: false })
  hasButtons!: boolean;

  /**
   * Message-level buttons, lifted out of the BUTTONS component so the client
   * and the send path do not have to walk `components`. Carousel per-card
   * buttons stay inside `components[].cards[]`.
   */
  @Column({ name: 'buttons', type: 'jsonb', nullable: true })
  buttons!: TemplateButton[] | null;

  @Column({
    name: 'template_subtype',
    type: 'varchar',
    length: 20,
    default: 'standard',
  })
  templateSubtype!: TemplateSubtype;

  @Column({ name: 'is_carousel', type: 'boolean', default: false })
  isCarousel!: boolean;

  /**
   * Card count Meta approved. Fixed at creation — an approved 3-card carousel
   * can only ever be sent with exactly 3 cards.
   */
  @Column({ name: 'carousel_card_count', type: 'int', nullable: true })
  carouselCardCount!: number | null;

  /** Rolling 30-day sent count from Meta template_analytics API. */
  @Column({ name: 'meta_sent_count', type: 'int', nullable: true })
  metaSentCount!: number | null;

  @Column({ name: 'meta_delivered_count', type: 'int', nullable: true })
  metaDeliveredCount!: number | null;

  @Column({ name: 'meta_read_count', type: 'int', nullable: true })
  metaReadCount!: number | null;

  /** Top block reason from Meta quality_score.reasons (e.g. MISLEADING_CONTENT). */
  @Column({ name: 'top_block_reason', type: 'varchar', length: 80, nullable: true })
  topBlockReason!: string | null;

  @Column({ name: 'analytics_updated_at', type: 'timestamptz', nullable: true })
  analyticsUpdatedAt!: Date | null;
}
