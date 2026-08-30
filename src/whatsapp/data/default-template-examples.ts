import type {
  TemplateCategory,
  TemplateComponent,
} from '../../whatsapp/entities/wa-template.entity';
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
    metaTip:
      'Utility must match a user-requested update. Don’t add discounts here.',
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
    useWhen:
      'Clinics, salons, service bookings — reminder of an existing appointment.',
    metaTip:
      'Must refer to an appointment the customer already has; avoid sales pitches.',
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
    metaTip:
      'Don’t bundle unrelated offers — that often gets categorized as Marketing.',
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
    metaTip:
      'Always include clear opt-out. Marketing is reviewed more strictly than Utility.',
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
    metaTip:
      'Recipients must have opted in to marketing. Avoid misleading urgency.',
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
  // ── Button templates ────────────────────────────────────────────────────────
  {
    slug: 'confirm_reply_buttons',
    suggestedName: 'confirm_reply_buttons',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, please confirm your appointment on {{2}} at {{3}}.',
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirm ✅' },
          { type: 'QUICK_REPLY', text: 'Cancel ❌' },
          { type: 'QUICK_REPLY', text: 'Reschedule' },
        ],
      },
    ],
    useWhen: 'Appointment / order confirmation that needs a one-tap yes/no.',
    metaTip:
      'Quick Reply buttons return a webhook payload — wire a chatbot flow to branch on the reply.',
    sortOrder: 100,
    status: 'published',
  },
  {
    slug: 'track_order_url_button',
    suggestedName: 'track_order_url_button',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order {{2}} is on its way! Click below to track it live.',
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Track order',
            url: 'https://track.example.com/{{1}}',
            example: ['ORD-123456'],
          },
        ],
      },
    ],
    useWhen: 'Delivery notifications with a deep-link to the tracking page.',
    metaTip:
      'URL buttons support one {{1}} variable appended to a base URL. Provide an example value so Meta can validate.',
    sortOrder: 110,
    status: 'published',
  },
  {
    slug: 'call_us_phone_button',
    suggestedName: 'call_us_phone_button',
    category: 'UTILITY',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, your support request #{{2}} is ready for a callback. Tap below to reach our team.',
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'PHONE_NUMBER',
            text: 'Call support',
            phone_number: '+918000000000',
          },
        ],
      },
    ],
    useWhen: 'Support follow-ups or callback prompts.',
    metaTip:
      'Phone number must include country code. Replace with your actual support line.',
    sortOrder: 120,
    status: 'published',
  },
  {
    slug: 'coupon_copy_code',
    suggestedName: 'coupon_copy_code',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, here is your exclusive discount code — valid until {{2}}. Tap below to copy it.',
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'COPY_CODE', example: 'SUMMER20' }],
      },
    ],
    useWhen:
      'Promo campaigns where the customer needs a coupon code to redeem.',
    metaTip:
      'Copy-code button label is fixed by Meta ("Copy offer code"). The `example` field carries the sample coupon for Meta review.',
    sortOrder: 130,
    status: 'published',
  },
  // ── Limited Time Offer ──────────────────────────────────────────────────────
  {
    slug: 'flash_sale_lto',
    suggestedName: 'flash_sale_lto',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: '⚡ Flash sale — {{1}} off',
      },
      {
        type: 'LIMITED_TIME_OFFER',
        limited_time_offer: {
          text: 'Offer expires soon',
          has_expiration: true,
        },
      },
      {
        type: 'BODY',
        text: "Hi {{1}}, grab {{2}} off sitewide. This deal ends at {{3}} — don't miss it!",
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Shop now',
            url: 'https://shop.example.com/sale',
          },
        ],
      },
    ],
    useWhen: 'Time-boxed flash sales where the countdown timer adds urgency.',
    metaTip:
      "The LIMITED_TIME_OFFER component activates Meta's native countdown timer inside WhatsApp. Pair with a URL button.",
    sortOrder: 140,
    status: 'published',
  },
  // ── Authentication / OTP with copy-code button ──────────────────────────────
  {
    slug: 'auth_otp_copy_code',
    suggestedName: 'auth_otp_copy_code',
    category: 'AUTHENTICATION',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: '{{1}} is your verification code.',
        add_security_recommendation: true,
      },
      {
        type: 'FOOTER',
        code_expiration_minutes: 10,
      },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copy code' }],
      },
    ],
    useWhen:
      'Authentication OTP with a native "Copy code" button — Meta\'s recommended format for auth templates.',
    metaTip:
      'Submit as category AUTHENTICATION. The BODY `add_security_recommendation` appends Meta\'s "Do not share this code" line automatically.',
    sortOrder: 150,
    status: 'published',
  },
  // ── Carousel ────────────────────────────────────────────────────────────────
  {
    slug: 'product_showcase_carousel',
    suggestedName: 'product_showcase_carousel',
    category: 'MARKETING',
    language: 'en_US',
    components: [
      {
        type: 'BODY',
        text: 'Hi {{1}}, check out our top picks just for you 👇',
      },
      {
        type: 'CAROUSEL',
        cards: [
          {
            components: [
              { type: 'HEADER', format: 'IMAGE' },
              { type: 'BODY', text: '{{1}} — {{2}}' },
              {
                type: 'BUTTONS',
                buttons: [
                  {
                    type: 'URL',
                    text: 'View product',
                    url: 'https://shop.example.com/{{1}}',
                    example: ['product-a'],
                  },
                ],
              },
            ],
          },
          {
            components: [
              { type: 'HEADER', format: 'IMAGE' },
              { type: 'BODY', text: '{{1}} — {{2}}' },
              {
                type: 'BUTTONS',
                buttons: [
                  {
                    type: 'URL',
                    text: 'View product',
                    url: 'https://shop.example.com/{{1}}',
                    example: ['product-b'],
                  },
                ],
              },
            ],
          },
          {
            components: [
              { type: 'HEADER', format: 'IMAGE' },
              { type: 'BODY', text: '{{1}} — {{2}}' },
              {
                type: 'BUTTONS',
                buttons: [
                  {
                    type: 'URL',
                    text: 'View product',
                    url: 'https://shop.example.com/{{1}}',
                    example: ['product-c'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    useWhen:
      'Showcase 2–10 products or categories in a horizontally scrollable card deck.',
    metaTip:
      'Upload card images after Meta approves the template. All cards share the same button type. Variable {{1}} in each card body is independent per card.',
    sortOrder: 160,
    status: 'published',
  },
];
