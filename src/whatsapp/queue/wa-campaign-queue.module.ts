import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaCampaign } from '../entities/wa-campaign.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { WaFlow } from '../entities/wa-flow.entity';
import { WaFlowSession } from '../entities/wa-flow-session.entity';
import { MetaGraphClient } from '../services/meta-graph.client';
import { WhatsappFlowsService } from '../services/whatsapp-flows.service';
import { WA_CAMPAIGN_QUEUE } from './wa-campaign.constants';
import { WaCampaignProcessor } from './wa-campaign.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: WA_CAMPAIGN_QUEUE }),
    TypeOrmModule.forFeature([
      WaCampaign,
      WaContact,
      WaConversation,
      WaMessage,
      WaTemplate,
      WabaAccount,
      PhoneNumber,
      WaFlow,
      WaFlowSession,
    ]),
  ],
  providers: [WaCampaignProcessor, MetaGraphClient, WhatsappFlowsService],
  exports: [BullModule],
})
export class WaCampaignQueueModule {}
