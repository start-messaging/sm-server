import type { TemplateCategory, TemplateComponent } from '../../whatsapp/entities/wa-template.entity';
import type { TemplateExampleStatus } from '../../whatsapp/entities/wa-template-example.entity';

/**
 * Canonical starter gallery — mirrors sm-client/src/lib/template-examples.ts.
 * Seed inserts missing rows by slug only (never overwrites admin edits).
 */
export interface TemplateExampleSeed {
  slug: string;
  suggestedName: string;
  category: TemplateCategory;
  language: string;
  components: TemplateComponent[];
  useWhen: string;
  metaTip: string;
  sortOrder: number;
  status: TemplateExampleStatus;
}

export const DEFAULT_TEMPLATE_EXAMPLES: TemplateExampleSeed[] = [
  {
    slug: 'hello_world',
    suggestedName: 'welcome_greeting',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hello {{1}}, thanks for connecting with us on WhatsApp. How can we help you today?',
      },
    ],
    useWhen: 'First smoke-test after Cloud API connect — simple greeting.',
    metaTip:
      'Do not use the name hello_world — Meta already created that sample on every WABA. Keep copy transactional.',
    sortOrder: 10,
    status: 'published',
  },
  {
    slug: 'order_update',
    suggestedName: 'order_update',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order {{2}} is now {{3}}. Track updates anytime in your account.',
      },
      {
        type: 'FOOTER',
        text: 'Reply STOP to opt out of order updates.',
      },
    ],
    useWhen: 'Ecommerce order status (confirmed, shipped, delivered).',
    metaTip: 'Utility must match a user-requested update. Don’t add discounts here.',
    sortOrder: 20,
    status: 'published',
  },
  {
    slug: 'appointment_reminder',
    suggestedName: 'appointment_reminder',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, reminder: your appointment is on {{2}} at {{3}}. Reply YES to confirm or call us to reschedule.',
      },
    ],
    useWhen: 'Clinics, salons, service bookings — reminder of an existing appointment.',
    metaTip: 'Must refer to an appointment the customer already has; avoid sales pitches.',
    sortOrder: 30,
    status: 'published',
  },
  {
    slug: 'payment_reminder',
    suggestedName: 'payment_reminder',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, this is a reminder that invoice {{2}} for {{3}} is due on {{4}}. Pay securely via your usual channel.',
      },
    ],
    useWhen: 'Invoice / dues reminder the customer already owes.',
    metaTip: 'Don’t bundle unrelated offers — that often gets categorized as Marketing.',
    sortOrder: 40,
    status: 'published',
  },
  {
    slug: 'shipping_update',
    suggestedName: 'shipping_update',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your package {{2}} is out for delivery today. Expected by {{3}}.',
      },
    ],
    useWhen: 'Logistics / delivery ETA for an existing shipment.',
    metaTip: 'Stick to delivery facts; keep branding light.',
    sortOrder: 50,
    status: 'published',
  },
  {
    slug: 'promo_offer',
    suggestedName: 'promo_offer',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Special offer',
      },
      {
        type: 'BODY',
        text: 'Hi {{1}}, enjoy {{2}} off until {{3}}. Use code {{4}} at checkout. Reply STOP to opt out.',
      },
      {
        type: 'FOOTER',
        text: 'Terms apply. Opt out anytime.',
      },
    ],
    useWhen: 'Sales, discounts, seasonal campaigns to opted-in customers.',
    metaTip: 'Always include clear opt-out. Marketing is reviewed more strictly than Utility.',
    sortOrder: 60,
    status: 'published',
  },
  {
    slug: 'new_arrival',
    suggestedName: 'new_arrival',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, {{2}} just dropped. Explore what’s new and shop today. Reply STOP to unsubscribe.',
      },
    ],
    useWhen: 'Product launch or catalogue “what’s new” blasts.',
    metaTip: 'Recipients must have opted in to marketing. Avoid misleading urgency.',
    sortOrder: 70,
    status: 'published',
  },
  {
    slug: 'feedback_request',
    suggestedName: 'feedback_request',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, thanks for choosing us! How was your experience with {{2}}? Reply with a rating from 1–5. Reply STOP to opt out.',
      },
    ],
    useWhen: 'Post-purchase feedback / NPS style asks.',
    metaTip:
      'If it’s only transactional survey after a purchase, Utility may fit better — pick category carefully.',
    sortOrder: 80,
    status: 'published',
  },
  {
    slug: 'otp_verification',
    suggestedName: 'otp_verification',
    category: 'AUTHENTICATION',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Your verification code is {{1}}. It expires in {{2}} minutes. Do not share this code with anyone.',
      },
    ],
    useWhen: 'Login / signup OTP when the user requested a code.',
    metaTip:
      'Meta often requires the official AUTHENTICATION + OTP button format. If rejected, recreate as Auth OTP in WhatsApp Manager or extend our builder later.',
    sortOrder: 90,
    status: 'published',
  },
];
