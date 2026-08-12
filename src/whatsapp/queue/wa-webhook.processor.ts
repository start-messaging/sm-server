import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import {
  WaWebhookEvent,
  WaWebhookEventStatus,
  WaWebhookEventType,
} from '../entities/wa-webhook-event.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage, MessageStatus } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import {
  WabaAccount,
  WabaAccountStatus,
} from '../entities/waba-account.entity';
import { PhoneNumber, WaQualityRating } from '../entities/phone-number.entity';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import { WA_WEBHOOK_QUEUE } from './wa-webhook.constants';

export interface WaWebhookJobData {
  eventId: string;
}

@Processor(WA_WEBHOOK_QUEUE)
export class WaWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WaWebhookProcessor.name);

  constructor(
    @InjectRepository(WaWebhookEvent)
    private readonly events: Repository<WaWebhookEvent>,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectRepository(WaTemplate)
    private readonly templates: Repository<WaTemplate>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {
    super();
  }

  async process(job: Job<WaWebhookJobData>): Promise<void> {
    const { eventId } = job.data;

    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) {
      this.logger.warn(`WaWebhookEvent ${eventId} not found — skipping`);
      return;
    }

    if (event.status !== WaWebhookEventStatus.PENDING) {
      return;
    }

    try {
      await this.routeEvent(event);

      await this.events.update(eventId, {
        status: WaWebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        attempts: () => 'attempts + 1',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `wa-webhook ${eventId} failed: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );

      await this.events.update(eventId, {
        status: WaWebhookEventStatus.FAILED,
        attempts: () => 'attempts + 1',
        error: message,
      });

      throw err;
    }
  }

  private async routeEvent(event: WaWebhookEvent): Promise<void> {
    switch (event.eventType) {
      case WaWebhookEventType.INBOUND_MESSAGE:
        await this.handleInboundMessage(event);
        break;
      case WaWebhookEventType.MESSAGE_STATUS:
        await this.handleMessageStatus(event);
        break;
      case WaWebhookEventType.TEMPLATE_STATUS:
        await this.handleTemplateStatus(event);
        break;
      case WaWebhookEventType.ACCOUNT_UPDATE:
        await this.handleAccountUpdate(event);
        break;
      case WaWebhookEventType.PHONE_QUALITY_UPDATE:
        await this.handlePhoneQualityUpdate(event);
        break;
      default:
        this.logger.debug(
          `Processing wa-webhook ${event.id} type=${event.eventType} (no-op handler)`,
        );
    }
  }

  private async handleInboundMessage(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const metaMessages =
          (value['messages'] as Array<Record<string, unknown>>) ?? [];
        const metadata = value['metadata'] as
          | Record<string, string>
          | undefined;
        const contacts =
          (value['contacts'] as Array<Record<string, string>>) ?? [];

        if (!metaMessages.length) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        for (const msg of metaMessages) {
          const from = msg['from'] as string;
          const contactName = contacts[0]
            ? ((contacts[0] as unknown as { profile?: { name?: string } })
                ?.profile?.name ?? null)
            : null;
          const wamid = msg['id'] as string;
          const msgType = msg['type'] as string;
          const textBody =
            (msg['text'] as Record<string, string> | undefined)?.['body'] ??
            null;
          const ts = msg['timestamp'] as string;
          const timestamp = ts ? new Date(parseInt(ts, 10) * 1000) : new Date();

          // Find or create conversation
          let conversation = await this.conversations.findOne({
            where: { workspaceId, contactPhone: from },
          });
          if (!conversation) {
            conversation = this.conversations.create({
              workspaceId,
              contactPhone: from,
              contactName: contactName,
              lastInboundAt: timestamp,
              unreadCount: 1,
              lastMessageBody: textBody,
              lastMessageAt: timestamp,
            });
            await this.conversations.save(conversation);
          } else {
            conversation.lastInboundAt = timestamp;
            conversation.unreadCount += 1;
            conversation.lastMessageBody = textBody;
            conversation.lastMessageAt = timestamp;
            if (contactName) conversation.contactName = contactName;
            await this.conversations.save(conversation);
          }

          // Insert message (dedup on wamid)
          const existing = await this.messages.findOne({
            where: { metaMessageId: wamid },
          });
          if (!existing) {
            const message = this.messages.create({
              workspaceId,
              conversationId: conversation.id,
              direction: 'inbound',
              status: 'delivered',
              body: textBody,
              timestamp,
              metaMessageId: wamid,
              templateName: null,
            });
            await this.messages.save(message);
            await this.inboxRealtime.publishInboxUpdated(
              workspaceId,
              conversation.id,
              'inbound',
            );
          }
        }
      }
    }
  }

  private async handleMessageStatus(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const statuses =
          (value['statuses'] as Array<Record<string, unknown>>) ?? [];

        for (const statusUpdate of statuses) {
          const wamid = statusUpdate['id'] as string;
          const status = statusUpdate['status'] as string;

          if (!wamid || !status) continue;

          const mappedStatus = this.mapMetaStatus(status);
          if (!mappedStatus) continue;

          const message = await this.messages.findOne({
            where: { metaMessageId: wamid },
          });
          if (
            message &&
            this.isStatusAdvancement(message.status, mappedStatus)
          ) {
            message.status = mappedStatus;
            await this.messages.save(message);
            await this.inboxRealtime.publishInboxUpdated(
              message.workspaceId,
              message.conversationId,
              'status',
            );
          }
        }
      }
    }
  }

  private async handleTemplateStatus(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const templateName = value['message_template_name'] as
          | string
          | undefined;
        const templateStatus = value['event'] as string | undefined;
        const reason = value['reason'] as string | undefined;

        if (!templateName || !templateStatus) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        const template = await this.templates.findOne({
          where: { workspaceId, name: templateName },
        });
        if (template) {
          template.status =
            templateStatus.toUpperCase() as WaTemplate['status'];
          if (reason) template.rejectionReason = reason;
          await this.templates.save(template);
        }
      }
    }
  }

  /**
   * account_update: Meta fires this for partner events (PARTNER_ADDED, disconnect
   * signals, etc.) and account-level state changes. Persist useful fields on the
   * WabaAccount when present; log structured data; never crash on unknown shapes.
   */
  private async handleAccountUpdate(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const accountEvent = value['event'] as string | undefined;
        const metaWabaId = entry.id;

        this.logger.log(
          `account_update received: event=${accountEvent ?? 'unknown'} waba=${metaWabaId ?? 'unknown'}`,
          { eventId: event.id, accountEvent, metaWabaId, value },
        );

        if (!metaWabaId) continue;

        const waba = await this.wabaAccounts.findOne({
          where: { metaWabaId },
        });
        if (!waba) {
          this.logger.warn(
            `account_update: no WabaAccount found for metaWabaId=${metaWabaId}`,
          );
          continue;
        }

        if (accountEvent === 'DISABLED' || accountEvent === 'DISCONNECTED') {
          waba.status = WabaAccountStatus.DISCONNECTED;
          await this.wabaAccounts.save(waba);
          this.logger.log(
            `WabaAccount ${waba.id} status → DISCONNECTED (event=${accountEvent})`,
          );
        } else if (accountEvent === 'SUSPENDED') {
          waba.status = WabaAccountStatus.SUSPENDED;
          await this.wabaAccounts.save(waba);
          this.logger.log(`WabaAccount ${waba.id} status → SUSPENDED`);
        } else if (
          accountEvent === 'PARTNER_ADDED' ||
          accountEvent === 'REINSTATED'
        ) {
          waba.status = WabaAccountStatus.ACTIVE;
          await this.wabaAccounts.save(waba);
          this.logger.log(
            `WabaAccount ${waba.id} status → ACTIVE (event=${accountEvent})`,
          );
        }
        // Unknown events are logged above but do not crash
      }
    }
  }

  /**
   * phone_quality_update: Meta fires this when a phone number's quality rating
   * changes (GREEN → YELLOW → RED) or messaging limits change. Update the
   * PhoneNumber entity with the new quality/status if present.
   */
  private async handlePhoneQualityUpdate(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const displayPhone = value['display_phone_number'] as
          | string
          | undefined;
        const qualityStr = value['current_limit'] as string | undefined;
        const eventStr = value['event'] as string | undefined;

        this.logger.log(
          `phone_quality_update received: phone=${displayPhone ?? 'unknown'} event=${eventStr ?? 'unknown'}`,
          { eventId: event.id, value },
        );

        const metaPhoneId = event.metaPhoneNumberId;
        if (!metaPhoneId && !displayPhone) continue;

        let phoneNumber: PhoneNumber | null = null;
        if (metaPhoneId) {
          phoneNumber = await this.phoneNumbers.findOne({
            where: { metaPhoneNumberId: metaPhoneId },
          });
        }
        if (!phoneNumber && displayPhone) {
          const normalized = displayPhone.replace(/[^+\d]/g, '');
          phoneNumber = await this.phoneNumbers.findOne({
            where: { displayNumberE164: normalized },
          });
        }

        if (!phoneNumber) {
          this.logger.warn(
            `phone_quality_update: no PhoneNumber found for meta_id=${metaPhoneId} display=${displayPhone}`,
          );
          continue;
        }

        const eventTs = event.metaEventTs;
        if (
          eventTs &&
          phoneNumber.statusSyncedAt &&
          eventTs <= phoneNumber.statusSyncedAt
        ) {
          this.logger.debug(
            `phone_quality_update: stale event for phone ${phoneNumber.id} — skipping`,
          );
          continue;
        }

        const newQuality = this.mapQualityRating(eventStr);
        if (newQuality) {
          phoneNumber.qualityRating = newQuality;
        }

        const newLimit = this.parseMessagingLimit(qualityStr);
        if (newLimit !== null) {
          phoneNumber.messagingLimitPerDay = newLimit;
        }

        if (eventTs) {
          phoneNumber.statusSyncedAt = eventTs;
        }

        await this.phoneNumbers.save(phoneNumber);
        this.logger.log(
          `PhoneNumber ${phoneNumber.id} quality → ${phoneNumber.qualityRating}, limit → ${phoneNumber.messagingLimitPerDay}`,
        );
      }
    }
  }

  private mapQualityRating(event: string | undefined): WaQualityRating | null {
    if (!event) return null;
    const upper = event.toUpperCase();
    if (upper.includes('GREEN')) return WaQualityRating.GREEN;
    if (upper.includes('YELLOW')) return WaQualityRating.YELLOW;
    if (upper.includes('RED')) return WaQualityRating.RED;
    return null;
  }

  private parseMessagingLimit(limitStr: string | undefined): number | null {
    if (!limitStr) return null;
    const match = limitStr.match(/(\d+)/);
    return match?.[1] ? parseInt(match[1], 10) : null;
  }

  private async resolveWorkspaceId(
    wabaAccountId: string | null,
  ): Promise<string | null> {
    if (!wabaAccountId) return null;
    const waba = await this.wabaAccounts.findOne({
      where: { id: wabaAccountId },
      select: { workspaceId: true },
    });
    return waba?.workspaceId ?? null;
  }

  private mapMetaStatus(status: string): MessageStatus | null {
    switch (status) {
      case 'sent':
        return 'sent';
      case 'delivered':
        return 'delivered';
      case 'read':
        return 'read';
      case 'failed':
        return 'failed';
      default:
        return null;
    }
  }

  private isStatusAdvancement(
    current: MessageStatus,
    incoming: MessageStatus,
  ): boolean {
    const order: Record<MessageStatus, number> = {
      queued: 0,
      sent: 1,
      delivered: 2,
      read: 3,
      failed: 4,
    };
    if (incoming === 'failed') return true;
    return order[incoming] > order[current];
  }
}
