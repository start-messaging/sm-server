/**
 * Razorpay payment provider — CRM SaaS subscriptions.
 *
 * Uses Razorpay Subscriptions API to create hosted checkout sessions.
 * Do NOT use this for message wallet top-up — that path is parked.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../config/env.validation';
import type {
  CancelSubscriptionInput,
  CreateSubscriptionInput,
  PaymentProvider,
  SubscriptionResult,
} from '../payment-provider.interface';

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly providerKey = 'razorpay';
  private readonly logger = new Logger(RazorpayProvider.name);
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(private readonly configService: ConfigService<EnvVars, true>) {
    this.keyId =
      this.configService.get('RAZORPAY_KEY_ID', { infer: true }) ?? '';
    this.keySecret =
      this.configService.get('RAZORPAY_KEY_SECRET', { infer: true }) ?? '';
    if (this.keyId) {
      this.logger.log('Razorpay provider initialised');
    }
  }

  async createSubscription(
    input: CreateSubscriptionInput,
  ): Promise<SubscriptionResult> {
    if (!this.keyId || !this.keySecret) {
      this.logger.warn(
        'Razorpay keys not configured — returning stub checkout',
      );
      return {
        subscriptionId: `stub_${Date.now()}`,
        shortUrl: '#razorpay-not-configured',
        raw: {},
      };
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      'base64',
    );

    const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan_id: input.planId,
        total_count: input.totalCount ?? 120,
        notes: input.notes ?? {},
      }),
    });

    const data = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      this.logger.error(
        `Razorpay createSubscription failed: ${JSON.stringify(data)}`,
      );
      throw new Error(`Razorpay error: ${data['error'] ?? res.status}`);
    }

    return {
      subscriptionId: data['id'] as string,
      shortUrl: data['short_url'] as string | undefined,
      raw: data,
    };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    if (!this.keyId || !this.keySecret) {
      this.logger.warn('Razorpay keys not configured — skipping cancel');
      return;
    }

    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString(
      'base64',
    );
    const url = `https://api.razorpay.com/v1/subscriptions/${input.subscriptionId}/cancel`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancel_at_cycle_end: input.cancelAtCycleEnd ? 1 : 0,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      this.logger.error(
        `Razorpay cancelSubscription failed: ${JSON.stringify(data)}`,
      );
      throw new Error(`Razorpay cancel error: ${res.status}`);
    }
  }

  async verifyWebhook(
    payload: string | Buffer,
    signature: string,
  ): Promise<Record<string, unknown>> {
    const crypto = await import('crypto');
    const webhookSecret =
      this.configService.get('RAZORPAY_WEBHOOK_SECRET', { infer: true }) ?? '';

    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(typeof payload === 'string' ? payload : payload.toString('utf-8'))
      .digest('hex');

    if (expectedSig !== signature) {
      throw new Error('Invalid Razorpay webhook signature');
    }

    const body =
      typeof payload === 'string' ? payload : payload.toString('utf-8');
    return JSON.parse(body) as Record<string, unknown>;
  }
}
