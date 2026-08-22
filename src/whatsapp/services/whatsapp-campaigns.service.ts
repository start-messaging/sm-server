import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository, In } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { WaCampaign, CampaignStatus } from '../entities/wa-campaign.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { WA_CAMPAIGN_QUEUE } from '../queue/wa-campaign.constants';

export interface CreateCampaignInput {
  name: string;
  templateName: string;
  templateLanguage: string;
  audienceIds: string[];
  scheduledAt?: string;
  variableMapping?: Record<string, string>;
}

export interface UpdateCampaignInput {
  name?: string;
  templateName?: string;
  templateLanguage?: string;
  audienceIds?: string[];
  scheduledAt?: string | null;
  variableMapping?: Record<string, string>;
}

@Injectable()
export class WhatsappCampaignsService {
  private readonly logger = new Logger(WhatsappCampaignsService.name);

  constructor(
    @InjectRepository(WaCampaign)
    private readonly campaigns: Repository<WaCampaign>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectQueue(WA_CAMPAIGN_QUEUE)
    private readonly campaignQueue: Queue,
  ) {}

  async list(workspaceId: string) {
    const [campaigns, total] = await this.campaigns.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { campaigns: campaigns.map(this.serialize), total };
  }

  async getById(workspaceId: string, id: string) {
    const campaign = await this.requireCampaign(workspaceId, id);
    return this.serialize(campaign);
  }

  async create(workspaceId: string, input: CreateCampaignInput) {
    const campaign = this.campaigns.create({
      workspaceId,
      name: input.name,
      templateName: input.templateName,
      templateLanguage: input.templateLanguage,
      audienceIds: input.audienceIds,
      variableMapping: input.variableMapping ?? {},
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      status: 'DRAFT' as CampaignStatus,
      stats: { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    });
    await this.campaigns.save(campaign);
    return this.serialize(campaign);
  }

  async update(workspaceId: string, id: string, input: UpdateCampaignInput) {
    const campaign = await this.requireCampaign(workspaceId, id);

    if (campaign.status !== 'DRAFT') {
      throw new AppException(
        {
          code: 'CAMPAIGN_NOT_EDITABLE',
          message: 'Only DRAFT campaigns can be edited',
        },
        400,
      );
    }

    if (input.name !== undefined) campaign.name = input.name;
    if (input.templateName !== undefined)
      campaign.templateName = input.templateName;
    if (input.templateLanguage !== undefined)
      campaign.templateLanguage = input.templateLanguage;
    if (input.audienceIds !== undefined)
      campaign.audienceIds = input.audienceIds;
    if (input.scheduledAt !== undefined) {
      campaign.scheduledAt = input.scheduledAt
        ? new Date(input.scheduledAt)
        : null;
    }
    if (input.variableMapping !== undefined) {
      campaign.variableMapping = input.variableMapping;
    }

    await this.campaigns.save(campaign);
    return this.serialize(campaign);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const campaign = await this.requireCampaign(workspaceId, id);
    if (campaign.status === 'RUNNING') {
      throw new AppException(
        {
          code: 'CAMPAIGN_RUNNING',
          message: 'Cannot delete a running campaign',
        },
        400,
      );
    }
    await this.campaigns.softRemove(campaign);
  }

  async launch(
    workspaceId: string,
    id: string,
    opts?: {
      planFeatures?: Record<string, boolean | string>;
      metaPaymentReady?: boolean | null;
    },
  ) {
    const campaign = await this.requireCampaign(workspaceId, id);

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new AppException(
        {
          code: 'CAMPAIGN_NOT_LAUNCHABLE',
          message: 'Campaign cannot be launched in current state',
        },
        400,
      );
    }

    // Plan-feature gate for wa_campaigns
    if (opts?.planFeatures && opts.planFeatures['wa_campaigns'] === false) {
      throw new AppException(
        {
          code: WA_ERR.PLAN_FEATURE_REQUIRED,
          message: 'Your CRM plan does not include campaigns. Please upgrade.',
        },
        403,
      );
    }

    // Meta payment-method gate (Tech Provider — Meta bills messages, not us)
    if (opts?.metaPaymentReady === false) {
      throw new AppException(
        {
          code: WA_ERR.META_PAYMENT_REQUIRED,
          message:
            'Add a payment method in WhatsApp Manager before launching a campaign. Meta bills conversations directly — this is not a CRM charge.',
        },
        403,
      );
    }

    // Count opted-in audience contacts (`In([])` is invalid SQL)
    const audienceCount = campaign.audienceIds.length
      ? await this.contacts.count({
          where: {
            id: In(campaign.audienceIds),
            workspaceId,
            optedIn: true,
          },
        })
      : 0;

    if (audienceCount === 0) {
      throw new AppException(
        {
          code: 'CAMPAIGN_NOT_LAUNCHABLE',
          message:
            'No opted-in contacts in this audience. Add contacts who have not sent STOP, then launch.',
        },
        400,
      );
    }

    campaign.status = 'RUNNING';
    campaign.launchedAt = new Date();
    campaign.stats = { ...campaign.stats, total: audienceCount };
    await this.campaigns.save(campaign);

    await this.enqueueSendJob(campaign.id, workspaceId);

    return this.serialize(campaign);
  }

  async pause(workspaceId: string, id: string) {
    const campaign = await this.requireCampaign(workspaceId, id);
    if (campaign.status !== 'RUNNING') {
      throw new AppException(
        {
          code: 'CAMPAIGN_NOT_RUNNING',
          message: 'Only running campaigns can be paused',
        },
        400,
      );
    }

    campaign.status = 'PAUSED';
    await this.campaigns.save(campaign);
    return this.serialize(campaign);
  }

  async resume(workspaceId: string, id: string) {
    const campaign = await this.requireCampaign(workspaceId, id);
    if (campaign.status !== 'PAUSED') {
      throw new AppException(
        {
          code: 'CAMPAIGN_NOT_PAUSED',
          message: 'Only paused campaigns can be resumed',
        },
        400,
      );
    }

    campaign.status = 'RUNNING';
    await this.campaigns.save(campaign);

    await this.enqueueSendJob(campaign.id, workspaceId);

    return this.serialize(campaign);
  }

  private async enqueueSendJob(campaignId: string, workspaceId: string) {
    await this.campaignQueue.add(
      'send-campaign',
      { campaignId, workspaceId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );
  }

  private async requireCampaign(
    workspaceId: string,
    id: string,
  ): Promise<WaCampaign> {
    const campaign = await this.campaigns.findOne({
      where: { id, workspaceId },
    });
    if (!campaign) {
      throw new AppException(
        { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found' },
        404,
      );
    }
    return campaign;
  }

  private serialize(c: WaCampaign) {
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      templateName: c.templateName,
      templateLanguage: c.templateLanguage,
      audienceIds: c.audienceIds,
      variableMapping: c.variableMapping,
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      launchedAt: c.launchedAt?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
      stats: c.stats,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
