/**
 * Stable WhatsApp error codes returned in AppException payloads.
 *
 * The client maps these to the educational UX layer (banners, modals, CTAs)
 * rather than displaying raw Meta error JSON. Every code must have a matching
 * entry in the client's error-message catalog.
 *
 * Naming convention: <DOMAIN>_<REASON>
 */
export const WA_ERR = {
  // ── Connection ────────────────────────────────────────────────────────────
  /** Workspace has no connected WABA. */
  WABA_NOT_CONNECTED: 'WABA_NOT_CONNECTED',

  /** WABA connect flow failed: Meta returned an error during code exchange. */
  WABA_CONNECT_FAILED: 'WABA_CONNECT_FAILED',

  /** Phone number registration (POST /{phone_id}/register) failed. */
  WABA_PHONE_REGISTER_FAILED: 'WABA_PHONE_REGISTER_FAILED',

  /** Webhook subscription (POST /{waba_id}/subscribed_apps) failed. */
  WABA_SUBSCRIBE_FAILED: 'WABA_SUBSCRIBE_FAILED',

  // ── Meta billing ──────────────────────────────────────────────────────────
  /**
   * Customer has not added a payment method to their WABA in WhatsApp Manager.
   * Meta bills conversations; we must NOT blame an internal wallet.
   */
  META_PAYMENT_REQUIRED: 'META_PAYMENT_REQUIRED',

  /** Meta rejected the send due to a billing/payment issue. */
  META_PAYMENT_DECLINED: 'META_PAYMENT_DECLINED',

  /** Generic Meta billing / payment method error on send. */
  META_BILLING_ERROR: 'META_BILLING_ERROR',

  // ── Messaging windows ────────────────────────────────────────────────────
  /** 24-hour customer-service window has closed; must use an approved template. */
  MESSAGE_WINDOW_CLOSED: 'MESSAGE_WINDOW_CLOSED',

  // ── Templates ─────────────────────────────────────────────────────────────
  /** Template is still pending Meta approval. */
  TEMPLATE_PENDING_APPROVAL: 'TEMPLATE_PENDING_APPROVAL',

  /** Template was rejected by Meta. */
  TEMPLATE_REJECTED: 'TEMPLATE_REJECTED',

  /** Template not found in this WABA. */
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',

  // ── Phone quality / limits ────────────────────────────────────────────────
  /** Phone number quality rating is red; sends are blocked or severely limited. */
  PHONE_QUALITY_RED: 'PHONE_QUALITY_RED',

  /** Phone number has hit its daily messaging cap. */
  PHONE_DAILY_LIMIT_REACHED: 'PHONE_DAILY_LIMIT_REACHED',

  /** Message could not be delivered to the recipient WhatsApp number. */
  MESSAGE_UNDELIVERABLE: 'MESSAGE_UNDELIVERABLE',

  /** Phone number is banned by Meta. */
  PHONE_BANNED: 'PHONE_BANNED',

  // ── Webhooks ──────────────────────────────────────────────────────────────
  /** Hub challenge verification failed (bad verify token). */
  WEBHOOK_VERIFY_FAILED: 'WEBHOOK_VERIFY_FAILED',

  /** Webhook signature (X-Hub-Signature-256) is invalid. */
  WEBHOOK_SIGNATURE_INVALID: 'WEBHOOK_SIGNATURE_INVALID',

  // ── SaaS plan gates ───────────────────────────────────────────────────────
  /** Workspace CRM plan does not include this feature. */
  PLAN_FEATURE_REQUIRED: 'PLAN_FEATURE_REQUIRED',

  /** CRM subscription is past-due; feature is soft-locked. */
  SUBSCRIPTION_PAST_DUE: 'SUBSCRIPTION_PAST_DUE',
} as const;

export type WaErrorCode = (typeof WA_ERR)[keyof typeof WA_ERR];
