/**
 * Payments module — CRM SaaS subscriptions (Razorpay now, Stripe later).
 *
 * IMPORTANT: This module is NOT involved in WhatsApp message sending.
 * Message usage is billed by Meta directly to the customer's WABA payment method.
 * This module only handles the customer → StartMessaging CRM subscription.
 */
import { Module } from '@nestjs/common';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { RazorpayProvider } from './providers/razorpay.provider';

@Module({
  providers: [
    RazorpayProvider,
    {
      provide: PAYMENT_PROVIDER,
      useExisting: RazorpayProvider,
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
