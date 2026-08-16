/**
 * Meta WhatsApp Business Account webhook fields + nested event values.
 * Source: whatsapp_business_account topic + account_update reference (May 2026).
 * Keep exhaustive — unknown values still route via default/no-op, never crash.
 */

/** All `changes[].field` values on object=whatsapp_business_account. */
export const META_WABA_WEBHOOK_FIELDS = [
  'account_alerts',
  'account_review_update',
  'account_settings_update',
  'account_update',
  'automatic_events',
  'business_capability_update',
  'business_status_update',
  'business_username_updates',
  'calls',
  'flows',
  'group_lifecycle_update',
  'group_participants_update',
  'group_settings_update',
  'group_status_update',
  'history',
  'message_echoes',
  'message_template_components_update',
  'message_template_quality_update',
  'message_template_status_update',
  'messages',
  'messaging_handovers',
  'partner_solutions',
  'payment_configuration_update',
  'phone_number_name_update',
  'phone_number_quality_update',
  'security',
  'smb_app_state_sync',
  'smb_message_echoes',
  'standby',
  'template_category_update',
  'template_correct_category_detection',
  'tracking_events',
  'user_preferences',
] as const;

export type MetaWabaWebhookField = (typeof META_WABA_WEBHOOK_FIELDS)[number];

/**
 * Official `account_update` `value.event` values from Meta docs, plus observed
 * Tech Provider / Cloud API extras we have seen in production payloads.
 */
export enum MetaAccountUpdateEvent {
  // Official (docs)
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ACCOUNT_RESTRICTION = 'ACCOUNT_RESTRICTION',
  ACCOUNT_VIOLATION = 'ACCOUNT_VIOLATION',
  AD_ACCOUNT_LINKED = 'AD_ACCOUNT_LINKED',
  AUTH_INTL_PRICE_ELIGIBILITY_UPDATE = 'AUTH_INTL_PRICE_ELIGIBILITY_UPDATE',
  BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE = 'BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE',
  DISABLED_UPDATE = 'DISABLED_UPDATE',
  MM_LITE_TERMS_SIGNED = 'MM_LITE_TERMS_SIGNED',
  PARTNER_ADDED = 'PARTNER_ADDED',
  PARTNER_APP_INSTALLED = 'PARTNER_APP_INSTALLED',
  PARTNER_APP_UNINSTALLED = 'PARTNER_APP_UNINSTALLED',
  PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE = 'PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE',
  PARTNER_REMOVED = 'PARTNER_REMOVED',
  VOLUME_BASED_PRICING_TIER_UPDATE = 'VOLUME_BASED_PRICING_TIER_UPDATE',
  ACCOUNT_OFFBOARDED = 'ACCOUNT_OFFBOARDED',
  ACCOUNT_RECONNECTED = 'ACCOUNT_RECONNECTED',
  // Observed / legacy (not always listed in current docs)
  PHONE_NUMBER_REMOVED = 'PHONE_NUMBER_REMOVED',
  DISABLED = 'DISABLED',
  DISCONNECTED = 'DISCONNECTED',
  SUSPENDED = 'SUSPENDED',
  REINSTATED = 'REINSTATED',
}

/** `message_template_status_update` `value.event` values. */
export enum MetaTemplateStatusEvent {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
  PENDING_DELETION = 'PENDING_DELETION',
  DELETED = 'DELETED',
  DISABLED = 'DISABLED',
  PAUSED = 'PAUSED',
  LIMIT_EXCEEDED = 'LIMIT_EXCEEDED',
  IN_APPEAL = 'IN_APPEAL',
  REINSTATED = 'REINSTATED',
  FLAGGED = 'FLAGGED',
}

/** Common inbound `messages[].type` values. */
export enum MetaInboundMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  DOCUMENT = 'document',
  STICKER = 'sticker',
  LOCATION = 'location',
  CONTACTS = 'contacts',
  INTERACTIVE = 'interactive',
  BUTTON = 'button',
  REACTION = 'reaction',
  ORDER = 'order',
  SYSTEM = 'system',
  UNKNOWN = 'unknown',
  UNSUPPORTED = 'unsupported',
}

/** Delivery `statuses[].status` values. */
export enum MetaMessageStatus {
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
  DELETED = 'deleted',
  WARNING = 'warning',
}

/** `DISABLED_UPDATE` `ban_info.waba_ban_state`. */
export enum MetaWabaBanState {
  DISABLE = 'DISABLE',
  REINSTATE = 'REINSTATE',
  SCHEDULE_FOR_DISABLE = 'SCHEDULE_FOR_DISABLE',
}
