import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaWebhookEvent } from '../entities/wa-webhook-event.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaInboxSettings } from '../entities/wa-inbox-settings.entity';
import { WaAssignmentEvent } from '../entities/wa-assignment-event.entity';
import { WaCampaign } from '../entities/wa-campaign.entity';
import { WorkspaceService } from '../../workspaces/entities/workspace-service.entity';
import { WorkspaceMember } from '../../workspaces/entities/workspace-member.entity';
import { WA_WEBHOOK_QUEUE } from './wa-webhook.constants';
import { WaWebhookProcessor } from './wa-webhook.processor';
import { WhatsappRealtimeModule } from '../realtime/whatsapp-realtime.module';
import { MetaGraphClient } from '../services/meta-graph.client';
import { WhatsappMediaService } from '../services/whatsapp-media.service';
import { R2UploadService } from '../../common/services/r2-upload.service';

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
      WaContact,
      WaInboxSettings,
      WaAssignmentEvent,
      WaCampaign,
      WorkspaceService,
      WorkspaceMember,
    ]),
    WhatsappRealtimeModule,
  ],
  providers: [
    WaWebhookProcessor,
    MetaGraphClient,
    WhatsappMediaService,
    R2UploadService,
  ],
  exports: [BullModule],
})
export class WaWebhookQueueModule {}
