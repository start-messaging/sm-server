import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhoneNumber } from './entities/phone-number.entity';
import { WabaAccount } from './entities/waba-account.entity';
import { WaWebhookEvent } from './entities/wa-webhook-event.entity';

/**
 * WhatsApp — a self-contained vertical (no shared cross-channel core until a 2nd
 * channel exists; see docs/decisions.md "Channels are independent verticals").
 *
 * Phase 5 scaffolds the CONNECTION layer only — the WABA root, its sender numbers,
 * and the edge webhook ingestion/idempotency log. Controllers/services land with the
 * Embedded-Signup connect flow. Messaging, templates, campaigns and inbox (the rest
 * of the wa_* tree) are later phases, documented in docs/part-6-build-plan.md — not
 * scaffolded as inert placeholders.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WabaAccount, PhoneNumber, WaWebhookEvent]),
  ],
})
export class WhatsappModule {}
