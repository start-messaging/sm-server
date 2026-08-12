import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from '../../config/env.validation';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../payments/payment-provider.interface';

export interface CheckoutInput {
  planCode: string;
  workspaceId: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
}

/**
 * Billing provider abstraction for CRM subscriptions.
 * Wraps the PaymentProvider interface so controllers deal only with checkout URLs.
 * Razorpay now; Stripe later via the same PaymentProvider interface.
 */
@Injectable()
export class BillingProviderService {
  private readonly logger = new Logger(BillingProviderService.name);

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService<EnvVars, true>,
  ) {}

  async createSubscriptionCheckout(
    input: CheckoutInput,
  ): Promise<CheckoutResult> {
    const result = await this.provider.createSubscription({
      planId: input.planCode,
      customerId: input.workspaceId,
      notes: {
        workspace_id: input.workspaceId,
        plan_code: input.planCode,
      },
    });

    return { checkoutUrl: result.shortUrl ?? '' };
  }
}
