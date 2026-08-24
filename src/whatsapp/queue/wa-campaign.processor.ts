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
import { AppException } from '../../common/exceptions/app.exception';
import { WA_CAMPAIGN_QUEUE } from './wa-campaign.constants';

export interface CampaignJobData {
  campaignId: string;
  workspaceId: string;
}

/**
 * A send target — either a real `WaContact` row (audienceIds) or a
 * validated `audienceCsv` row, unified so the send loop below doesn't care
 * which source it came from. `id` is null for CSV rows with no matching
 * contact.
 */
interface CampaignRecipient {
  id: string | null;
  phoneE164: string;
  name: string | null;
  attributes: Record<string, unknown>;
}

const BATCH_SIZE = 50;

const SUCCESS_STATUSES = new Set(['sent', 'delivered', 'read']);

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

    const recipients = await this.buildRecipients(campaign, workspaceId);

    campaign.stats = { ...campaign.stats, total: recipients.length };
    await this.persistProgress(campaign);

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      if (await this.isPaused(campaignId)) {
        this.logger.log(`Campaign ${campaignId} paused mid-send`);
        return;
      }

      const alreadySentPhones = await this.getAlreadySentPhones(
        campaignId,
        workspaceId,
      );

      const batch = recipients.slice(i, i + BATCH_SIZE);

      for (const recipient of batch) {
        if (
          alreadySentPhones.has(recipient.phoneE164) ||
          alreadySentPhones.has(recipient.phoneE164.replace(/^\+/, ''))
        ) {
          continue;
        }

        try {
          const built = this.buildBodyComponents(
            campaign.variableMapping ?? {},
            recipient,
          );
          if (built.missing.length > 0) {
            await this.recordFailedSend(
              campaign,
              workspaceId,
              recipient,
              131008,
              `Template variable ${built.missing.map((n) => `{{${n}}}`).join(', ')} is empty. Use a fixed value for everyone, or map to a contact field that has a value.`,
            );
            continue;
          }

          const result = await this.meta.sendMessage(
            phone.metaPhoneNumberId,
            {
              to: recipient.phoneE164.replace(/^\+/, ''),
              type: 'template',
              template: {
                name: campaign.templateName,
                language: { code: campaign.templateLanguage },
                ...(built.components.length
                  ? { components: built.components }
                  : {}),
              },
            },
            token,
          );

          const wamid = result.messages[0]?.id ?? '';
          const conversation = await this.ensureConversation(
            workspaceId,
            recipient,
            campaign.name,
          );

          const message = this.messages.create({
            workspaceId,
            conversationId: conversation.id,
            direction: 'outbound',
            status: 'sent',
            body: null,
            templateName: campaign.templateName,
            timestamp: new Date(),
            metaMessageId: wamid || null,
            campaignId: campaign.id,
          });
          await this.messages.save(message);

          campaign.stats = { ...campaign.stats, sent: campaign.stats.sent + 1 };
        } catch (err) {
          const { code, reason, billing } = this.extractMetaError(err);

          this.logger.warn(
            `Campaign ${campaignId} send to ${recipient.phoneE164} failed: ` +
              `code=${code ?? 'unknown'} reason=${reason}`,
          );

          await this.recordFailedSend(
            campaign,
            workspaceId,
            recipient,
            code,
            reason,
          );

          if (billing) {
            await this.persistProgress(campaign);
            await this.markFailed(
              campaign,
              'Meta payment method missing or declined — remaining sends stopped',
            );
            return;
          }
        }
      }

      if ((await this.persistProgress(campaign)) === 'paused') {
        this.logger.log(`Campaign ${campaignId} paused after batch`);
        return;
      }
    }

    if (await this.isPaused(campaignId)) {
      await this.persistProgress(campaign);
      return;
    }

    await this.persistProgress(campaign);
    const done = await this.campaigns.findOne({ where: { id: campaignId } });
    if (!done || done.status === 'PAUSED' || done.status === 'FAILED') {
      return;
    }
    done.status = 'COMPLETED';
    done.completedAt = new Date();
    await this.campaigns.save(done);
    this.logger.log(
      `Campaign ${campaignId} completed: ${JSON.stringify(done.stats)}`,
    );
  }

  /**
   * Build Graph API BODY components from the campaign's variableMapping.
   * Mapping values: `name` | `phone` | `attr:<key>` | `text:<literal>`.
   * Empty resolved params must not be sent — Meta returns 131008.
   */
  private buildBodyComponents(
    mapping: Record<string, string>,
    recipient: CampaignRecipient,
  ): {
    components: Array<{
      type: 'body';
      parameters: Array<{ type: 'text'; text: string }>;
    }>;
    missing: string[];
  } {
    const keys = Object.keys(mapping).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) {
      return { components: [], missing: [] };
    }

    const missing: string[] = [];
    const parameters = keys.map((key) => {
      const text = this.resolveMappedValue(mapping[key]!, recipient);
      if (!text.trim()) missing.push(key);
      return { type: 'text' as const, text };
    });

    return {
      components: [{ type: 'body', parameters }],
      missing,
    };
  }

  private resolveMappedValue(
    field: string,
    recipient: CampaignRecipient,
  ): string {
    if (field === 'name') return recipient.name ?? '';
    if (field === 'phone') return recipient.phoneE164;
    if (field.startsWith('attr:')) {
      const attrKey = field.slice('attr:'.length);
      const raw = recipient.attributes?.[attrKey];
      if (raw == null) return '';
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    }
    if (field.startsWith('text:')) return field.slice('text:'.length);
    return '';
  }

  private async recordFailedSend(
    campaign: WaCampaign,
    workspaceId: string,
    recipient: CampaignRecipient,
    code: number | null,
    reason: string,
  ): Promise<void> {
    const conversation = await this.ensureConversation(
      workspaceId,
      recipient,
      campaign.name,
    );
    const failedMsg = this.messages.create({
      workspaceId,
      conversationId: conversation.id,
      direction: 'outbound',
      status: 'failed',
      body: null,
      templateName: campaign.templateName,
      timestamp: new Date(),
      metaMessageId: null,
      campaignId: campaign.id,
      failureCode: code,
      failureReason: reason,
    });
    await this.messages.save(failedMsg);
    campaign.stats = {
      ...campaign.stats,
      failed: campaign.stats.failed + 1,
    };
  }

  /**
   * Unified send targets for a campaign: `audienceIds` contacts (must still
   * be opted-in) plus validated `audienceCsv` rows (Track 5c — already
   * opt-out-filtered on upload, but re-checked here in case a matching
   * contact opted out afterwards). Deduped by phone, contacts win over CSV
   * rows for the same number so a real contact record + id is preferred.
   */
  private async buildRecipients(
    campaign: WaCampaign,
    workspaceId: string,
  ): Promise<CampaignRecipient[]> {
    const audienceContacts = campaign.audienceIds.length
      ? await this.contacts.find({
          where: { id: In(campaign.audienceIds), workspaceId, optedIn: true },
        })
      : [];

    const csvEntries = campaign.audienceCsv ?? [];
    const csvContactMatches = csvEntries.length
      ? await this.contacts.find({
          where: {
            phoneE164: In(csvEntries.map((e) => e.phoneE164)),
            workspaceId,
          },
        })
      : [];
    const matchByPhone = new Map(
      csvContactMatches.map((c) => [c.phoneE164, c] as const),
    );

    const seenPhones = new Set<string>();
    const recipients: CampaignRecipient[] = [];

    for (const contact of audienceContacts) {
      if (seenPhones.has(contact.phoneE164)) continue;
      seenPhones.add(contact.phoneE164);
      recipients.push({
        id: contact.id,
        phoneE164: contact.phoneE164,
        name: contact.name,
        attributes: contact.attributes,
      });
    }

    for (const entry of csvEntries) {
      if (seenPhones.has(entry.phoneE164)) continue;
      const matched = matchByPhone.get(entry.phoneE164);
      if (matched && !matched.optedIn) continue;
      seenPhones.add(entry.phoneE164);
      recipients.push({
        id: matched?.id ?? null,
        phoneE164: entry.phoneE164,
        name: entry.name ?? matched?.name ?? null,
        attributes: entry.attrs ?? matched?.attributes ?? {},
      });
    }

    return recipients;
  }

  /**
   * Phones that already got a successful send for this campaign. Keyed by
   * phone rather than contact id since CSV recipients may have no
   * `WaContact` row. Failed rows are left retryable on resume.
   */
  private async getAlreadySentPhones(
    campaignId: string,
    workspaceId: string,
  ): Promise<Set<string>> {
    const existing = await this.messages.find({
      where: { campaignId, workspaceId },
      select: { conversationId: true, status: true },
    });
    const convIds = [
      ...new Set(
        existing
          .filter((m) => SUCCESS_STATUSES.has(m.status))
          .map((m) => m.conversationId),
      ),
    ];
    if (convIds.length === 0) return new Set();

    const convs = await this.conversations.find({
      where: { id: In(convIds) },
      select: { id: true, contactPhone: true },
    });

    const phones = new Set<string>();
    for (const conv of convs) {
      phones.add(conv.contactPhone);
      phones.add(conv.contactPhone.replace(/^\+/, ''));
    }
    return phones;
  }

  private async ensureConversation(
    workspaceId: string,
    recipient: CampaignRecipient,
    campaignName: string,
  ): Promise<WaConversation> {
    let conversation = await this.conversations.findOne({
      where: { workspaceId, contactPhone: recipient.phoneE164 },
    });
    if (!conversation) {
      const digits = recipient.phoneE164.replace(/^\+/, '');
      if (digits !== recipient.phoneE164) {
        conversation = await this.conversations.findOne({
          where: { workspaceId, contactPhone: digits },
        });
        if (conversation) {
          conversation.contactPhone = recipient.phoneE164;
        }
      }
    }

    const preview = `[Campaign: ${campaignName}]`;
    const now = new Date();

    if (!conversation) {
      conversation = this.conversations.create({
        workspaceId,
        contactId: recipient.id,
        contactPhone: recipient.phoneE164,
        contactName: recipient.name,
        unreadCount: 0,
        lastMessageBody: preview,
        lastMessageAt: now,
      });
    } else {
      if (!conversation.contactId && recipient.id) {
        conversation.contactId = recipient.id;
      }
      conversation.lastMessageBody = preview;
      conversation.lastMessageAt = now;
    }

    return this.conversations.save(conversation);
  }

  /**
   * Write this worker's sent/failed/total onto a freshly loaded row so
   * webhook-delivered/read counters are not clobbered.
   */
  private async persistProgress(
    campaign: WaCampaign,
  ): Promise<'paused' | 'ok'> {
    const latest = await this.campaigns.findOne({
      where: { id: campaign.id },
    });
    if (!latest) return 'ok';
    latest.stats = {
      ...latest.stats,
      total: campaign.stats.total,
      sent: campaign.stats.sent,
      failed: campaign.stats.failed,
    };
    await this.campaigns.save(latest);
    campaign.stats = latest.stats;
    return latest.status === 'PAUSED' ? 'paused' : 'ok';
  }

  private async isPaused(campaignId: string): Promise<boolean> {
    const fresh = await this.campaigns.findOne({
      where: { id: campaignId },
      select: { id: true, status: true },
    });
    return fresh?.status === 'PAUSED';
  }

  private extractMetaError(err: unknown): {
    code: number | null;
    reason: string;
    billing: boolean;
  } {
    if (err instanceof AppException) {
      const resp = err.getResponse() as Record<string, unknown>;
      const details = resp?.details as
        | { code?: number; error_subcode?: number; message?: string }
        | undefined;
      const metaCode = details?.code ?? null;
      const subcode = details?.error_subcode ?? null;
      const billing =
        metaCode === 368 ||
        metaCode === 131042 ||
        metaCode === 131047 ||
        subcode === 2388093 ||
        subcode === 2388094 ||
        subcode === 2388095;

      if (metaCode === 131008) {
        return {
          code: 131008,
          reason:
            'A template variable was empty. Map each {{n}} to a contact field that has a value, or use a fixed value for everyone.',
          billing: false,
        };
      }
      if (metaCode === 131026) {
        return {
          code: 131026,
          reason: 'Message undeliverable',
          billing: false,
        };
      }
      if (metaCode === 130429) {
        return {
          code: 130429,
          reason: 'Daily messaging limit reached',
          billing: false,
        };
      }
      if (billing) {
        return {
          code: metaCode ?? subcode,
          reason:
            'Add a payment method in WhatsApp Manager. Meta bills conversations — this is not a CRM charge.',
          billing: true,
        };
      }
      return {
        code: metaCode ?? subcode,
        reason:
          (resp?.message as string) ??
          details?.message ??
          'Meta Graph API error',
        billing: false,
      };
    }
    return {
      code: null,
      reason: err instanceof Error ? err.message : String(err),
      billing: false,
    };
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
