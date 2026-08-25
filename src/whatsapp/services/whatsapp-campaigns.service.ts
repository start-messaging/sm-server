import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository, In } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import {
  WaCampaign,
  CampaignAudienceCsvEntry,
  CampaignStatus,
} from '../entities/wa-campaign.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { WA_CAMPAIGN_QUEUE } from '../queue/wa-campaign.constants';

export interface CampaignAnalyticsDayPoint {
  date: string;
  delivered: number;
  read: number;
  failed: number;
}

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
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectQueue(WA_CAMPAIGN_QUEUE)
    private readonly campaignQueue: Queue,
  ) {}

  async list(workspaceId: string) {
    const [campaigns, total] = await this.campaigns.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { campaigns: campaigns.map((c) => this.serialize(c)), total };
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

  async duplicate(workspaceId: string, id: string) {
    const original = await this.requireCampaign(workspaceId, id);

    const clone = this.campaigns.create({
      workspaceId,
      name: `Copy of ${original.name}`,
      templateName: original.templateName,
      templateLanguage: original.templateLanguage,
      audienceIds: original.audienceIds,
      audienceCsv: original.audienceCsv,
      variableMapping: original.variableMapping,
      scheduledAt: null,
      status: 'DRAFT' as CampaignStatus,
      stats: { total: 0, sent: 0, delivered: 0, read: 0, failed: 0 },
    });
    await this.campaigns.save(clone);
    return this.serialize(clone);
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

    // The wa_campaigns plan gate lives in RequiresFeatureGuard on the route.

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

    // Count opted-in audience contacts (`In([])` is invalid SQL). CSV rows
    // were already opt-out-filtered on upload, so they count as-is.
    const contactAudienceCount = campaign.audienceIds.length
      ? await this.contacts.count({
          where: {
            id: In(campaign.audienceIds),
            workspaceId,
            optedIn: true,
          },
        })
      : 0;
    const audienceCount = contactAudienceCount + campaign.audienceCsv.length;

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

  /**
   * Replace a campaign's CSV audience (Track 5c). Each row's `phone` must be
   * a valid E.164 number — invalid rows are dropped. Rows whose phone
   * matches an existing opted-out `WaContact` are dropped too, so a CSV
   * upload can never re-target someone who sent STOP. `attr:<key>` row keys
   * become `attrs` for template variable mapping at send time.
   */
  async setAudienceCsv(
    workspaceId: string,
    id: string,
    rows: Record<string, string>[],
  ) {
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

    const seen = new Set<string>();
    const validated: CampaignAudienceCsvEntry[] = [];
    let skippedInvalidPhone = 0;
    let skippedDuplicate = 0;

    for (const row of rows) {
      let e164: string;
      try {
        ({ e164 } = parseMobileOrThrow(row.phone ?? ''));
      } catch {
        skippedInvalidPhone++;
        continue;
      }
      if (seen.has(e164)) {
        skippedDuplicate++;
        continue;
      }
      seen.add(e164);

      const attrs: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key.startsWith('attr:') && value?.trim()) {
          attrs[key.slice('attr:'.length)] = value.trim();
        }
      }

      const name = row.name?.trim();
      validated.push({
        phoneE164: e164,
        ...(name ? { name } : {}),
        ...(Object.keys(attrs).length ? { attrs } : {}),
      });
    }

    const optedOutContacts = validated.length
      ? await this.contacts.find({
          where: {
            workspaceId,
            phoneE164: In(validated.map((v) => v.phoneE164)),
            optedIn: false,
          },
          select: { phoneE164: true },
        })
      : [];
    const optedOutPhones = new Set(optedOutContacts.map((c) => c.phoneE164));
    const finalRows = validated.filter((v) => !optedOutPhones.has(v.phoneE164));

    campaign.audienceCsv = finalRows;
    await this.campaigns.save(campaign);

    return {
      campaign: this.serialize(campaign),
      added: finalRows.length,
      skippedInvalidPhone,
      skippedDuplicate,
      skippedOptedOut: optedOutPhones.size,
    };
  }

  async analytics(workspaceId: string, id: string) {
    const campaign = await this.requireCampaign(workspaceId, id);

    const rows = await this.messages
      .createQueryBuilder('m')
      .select("to_char(date_trunc('day', m.created_at), 'YYYY-MM-DD')", 'date')
      .addSelect('m.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('m.campaign_id = :campaignId', { campaignId: id })
      .andWhere('m.workspace_id = :workspaceId', { workspaceId })
      .groupBy("date_trunc('day', m.created_at)")
      .addGroupBy('m.status')
      .orderBy("date_trunc('day', m.created_at)", 'ASC')
      .getRawMany<{ date: string; status: string; count: string }>();

    const byDay = new Map<string, CampaignAnalyticsDayPoint>();
    for (const row of rows) {
      let point = byDay.get(row.date);
      if (!point) {
        point = { date: row.date, delivered: 0, read: 0, failed: 0 };
        byDay.set(row.date, point);
      }
      const count = Number(row.count);
      if (row.status === 'delivered') point.delivered += count;
      else if (row.status === 'read') point.read += count;
      else if (row.status === 'failed') point.failed += count;
    }

    const timeseries = Array.from(byDay.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    return { stats: campaign.stats, timeseries };
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
      audienceCsv: c.audienceCsv,
      variableMapping: c.variableMapping,
      scheduledAt: c.scheduledAt?.toISOString() ?? null,
      launchedAt: c.launchedAt?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
      stats: c.stats,
      skippedOptedOut: c.skippedOptedOut ?? 0,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
