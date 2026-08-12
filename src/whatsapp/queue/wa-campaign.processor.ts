import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository, In } from 'typeorm';
import { WaCampaign } from '../entities/wa-campaign.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { decryptToken } from '../crypto/token-encryption';
import { MetaGraphClient } from '../services/meta-graph.client';
import { WA_CAMPAIGN_QUEUE } from './wa-campaign.constants';

export interface CampaignJobData {
  campaignId: string;
  workspaceId: string;
}

const BATCH_SIZE = 50;

/**
 * Campaign send worker. Processes campaigns in batches via MetaGraphClient.
 *
 * IMPORTANT: Tech Provider — NO wallet debit on send. Meta bills the customer.
 */
@Processor(WA_CAMPAIGN_QUEUE)
export class WaCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(WaCampaignProcessor.name);

  constructor(
    private readonly meta: MetaGraphClient,
    @InjectRepository(WaCampaign)
    private readonly campaigns: Repository<WaCampaign>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
  ) {
    super();
  }

  async process(job: Job<CampaignJobData>): Promise<void> {
    const { campaignId, workspaceId } = job.data;

    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
    });
    if (!campaign || campaign.status !== 'RUNNING') {
      this.logger.warn(
        `Campaign ${campaignId} not found or not running — skipping`,
      );
      return;
    }

    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: 'whatsapp' },
    });
    if (!waba) {
      await this.markFailed(campaign, 'WABA not connected');
      return;
    }

    const phone = await this.phoneNumbers.findOne({
      where: { workspaceId, status: WaPhoneNumberStatus.ACTIVE },
    });
    if (!phone) {
      await this.markFailed(campaign, 'No active sender phone');
      return;
    }

    const token = decryptToken(waba.accessTokenEncrypted);

    // Fetch audience contacts
    const audienceContacts = await this.contacts.find({
      where: { id: In(campaign.audienceIds), workspaceId, optedIn: true },
    });

    campaign.stats = { ...campaign.stats, total: audienceContacts.length };
    await this.campaigns.save(campaign);

    // Process in batches
    for (let i = 0; i < audienceContacts.length; i += BATCH_SIZE) {
      // Check if paused mid-send
      const fresh = await this.campaigns.findOne({ where: { id: campaignId } });
      if (fresh?.status === 'PAUSED') {
        this.logger.log(`Campaign ${campaignId} paused mid-send`);
        return;
      }

      const batch = audienceContacts.slice(i, i + BATCH_SIZE);

      for (const contact of batch) {
        try {
          const result = await this.meta.sendMessage(
            phone.metaPhoneNumberId,
            {
              to: contact.phoneE164.replace(/^\+/, ''),
              type: 'template',
              template: {
                name: campaign.templateName,
                language: { code: campaign.templateLanguage },
              },
            },
            token,
          );

          const wamid = result.messages[0]?.id ?? '';

          // Ensure conversation exists
          let conversation = await this.conversations.findOne({
            where: { workspaceId, contactPhone: contact.phoneE164 },
          });
          if (!conversation) {
            conversation = this.conversations.create({
              workspaceId,
              contactId: contact.id,
              contactPhone: contact.phoneE164,
              contactName: contact.name,
              unreadCount: 0,
              lastMessageBody: `[Campaign: ${campaign.name}]`,
              lastMessageAt: new Date(),
            });
            await this.conversations.save(conversation);
          }

          // Record the sent message
          const message = this.messages.create({
            workspaceId,
            conversationId: conversation.id,
            direction: 'outbound',
            status: 'sent',
            body: null,
            templateName: campaign.templateName,
            timestamp: new Date(),
            metaMessageId: wamid,
          });
          await this.messages.save(message);

          campaign.stats = { ...campaign.stats, sent: campaign.stats.sent + 1 };
        } catch (err) {
          this.logger.warn(
            `Campaign ${campaignId} send to ${contact.phoneE164} failed: ${err instanceof Error ? err.message : err}`,
          );
          campaign.stats = {
            ...campaign.stats,
            failed: campaign.stats.failed + 1,
          };
        }
      }

      await this.campaigns.save(campaign);
    }

    campaign.status = 'COMPLETED';
    campaign.completedAt = new Date();
    await this.campaigns.save(campaign);
    this.logger.log(
      `Campaign ${campaignId} completed: ${JSON.stringify(campaign.stats)}`,
    );
  }

  private async markFailed(
    campaign: WaCampaign,
    reason: string,
  ): Promise<void> {
    campaign.status = 'FAILED';
    await this.campaigns.save(campaign);
    this.logger.error(`Campaign ${campaign.id} failed: ${reason}`);
  }
}
