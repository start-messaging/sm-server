import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaWebhookEvent } from '../entities/wa-webhook-event.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { WA_WEBHOOK_QUEUE } from './wa-webhook.constants';
import { WaWebhookProcessor } from './wa-webhook.processor';
import { WhatsappRealtimeModule } from '../realtime/whatsapp-realtime.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: WA_WEBHOOK_QUEUE }),
    TypeOrmModule.forFeature([
      WaWebhookEvent,
      WaConversation,
      WaMessage,
      WaTemplate,
      WabaAccount,
      PhoneNumber,
    ]),
    WhatsappRealtimeModule,
  ],
  providers: [WaWebhookProcessor],
  exports: [BullModule],
})
export class WaWebhookQueueModule {}
