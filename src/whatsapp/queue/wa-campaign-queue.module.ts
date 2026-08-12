import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaCampaign } from '../entities/wa-campaign.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { MetaGraphClient } from '../services/meta-graph.client';
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
      WabaAccount,
      PhoneNumber,
    ]),
  ],
  providers: [WaCampaignProcessor, MetaGraphClient],
  exports: [BullModule],
})
export class WaCampaignQueueModule {}
