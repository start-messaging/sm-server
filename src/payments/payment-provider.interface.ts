/**
 * Payment provider abstraction — Razorpay now, Stripe later (international).
 *
 * Only CRM SaaS subscriptions go through here.
 * Message wallet top-up is NOT wired to this interface (Tech Provider billing).
 */
export interface CreateSubscriptionInput {
  planId: string;
  customerId: string;
  totalCount?: number;
  notes?: Record<string, string>;
}

export interface SubscriptionResult {
  /** Provider-assigned subscription identifier. */
  subscriptionId: string;
  /** Short payment link / hosted page URL if applicable. */
  shortUrl?: string;
  /** Raw provider response for audit logging. */
  raw: Record<string, unknown>;
}

export interface CancelSubscriptionInput {
  subscriptionId: string;
  /** Cancel immediately or at end of current billing cycle. */
  cancelAtCycleEnd?: boolean;
}

export interface PaymentProvider {
  readonly providerKey: string;

  createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<SubscriptionResult>;

  cancelSubscription(input: CancelSubscriptionInput): Promise<void>;

  /**
   * Verify an inbound webhook payload and return the parsed event.
   * Throws on invalid signature.
   */
  verifyWebhook(
    payload: string | Buffer,
    signature: string,
  ): Promise<Record<string, unknown>>;
}

export const PAYMENT_PROVIDER = 'PAYMENT_PROVIDER';
