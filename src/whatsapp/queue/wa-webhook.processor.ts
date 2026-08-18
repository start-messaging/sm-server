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
import {
  PhoneNumber,
  WaPhoneNumberStatus,
  WaQualityRating,
} from '../entities/phone-number.entity';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import {
  WorkspaceService,
  WorkspaceServiceStatus,
} from '../../workspaces/entities/workspace-service.entity';
import {
  MetaAccountUpdateEvent,
  MetaInboundMessageType,
  MetaMessageStatus,
  MetaTemplateStatusEvent,
  MetaWabaBanState,
} from '../webhooks/meta-webhook.constants';
import {
  normalizeTemplateLanguage,
  parseTemplateCategory,
} from '../utils/template-category';
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

  /**
   * Exhaustive dispatch on stored event type (= Meta field, with messages split).
   * Unimplemented fields acknowledge as no-op so we never silently drop awareness.
   */
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
      case WaWebhookEventType.VERIFICATION_UPDATE:
        this.noopField(event, 'account_review_update');
        break;
      case WaWebhookEventType.SECURITY:
        this.noopField(event, 'security');
        break;
      case WaWebhookEventType.ACCOUNT_ALERTS:
        this.noopField(event, 'account_alerts');
        break;
      case WaWebhookEventType.ACCOUNT_SETTINGS_UPDATE:
        this.noopField(event, 'account_settings_update');
        break;
      case WaWebhookEventType.AUTOMATIC_EVENTS:
        this.noopField(event, 'automatic_events');
        break;
      case WaWebhookEventType.BUSINESS_CAPABILITY_UPDATE:
        this.noopField(event, 'business_capability_update');
        break;
      case WaWebhookEventType.BUSINESS_STATUS_UPDATE:
        this.noopField(event, 'business_status_update');
        break;
      case WaWebhookEventType.BUSINESS_USERNAME_UPDATES:
        this.noopField(event, 'business_username_updates');
        break;
      case WaWebhookEventType.CALLS:
        this.noopField(event, 'calls');
        break;
      case WaWebhookEventType.FLOWS:
        this.noopField(event, 'flows');
        break;
      case WaWebhookEventType.GROUP_LIFECYCLE_UPDATE:
        this.noopField(event, 'group_lifecycle_update');
        break;
      case WaWebhookEventType.GROUP_PARTICIPANTS_UPDATE:
        this.noopField(event, 'group_participants_update');
        break;
      case WaWebhookEventType.GROUP_SETTINGS_UPDATE:
        this.noopField(event, 'group_settings_update');
        break;
      case WaWebhookEventType.GROUP_STATUS_UPDATE:
        this.noopField(event, 'group_status_update');
        break;
      case WaWebhookEventType.HISTORY:
        this.noopField(event, 'history');
        break;
      case WaWebhookEventType.MESSAGE_ECHOES:
        this.noopField(event, 'message_echoes');
        break;
      case WaWebhookEventType.MESSAGE_TEMPLATE_COMPONENTS_UPDATE:
        this.noopField(event, 'message_template_components_update');
        break;
      case WaWebhookEventType.MESSAGE_TEMPLATE_QUALITY_UPDATE:
        this.noopField(event, 'message_template_quality_update');
        break;
      case WaWebhookEventType.MESSAGING_HANDOVERS:
        this.noopField(event, 'messaging_handovers');
        break;
      case WaWebhookEventType.PARTNER_SOLUTIONS:
        this.noopField(event, 'partner_solutions');
        break;
      case WaWebhookEventType.PAYMENT_CONFIGURATION_UPDATE:
        this.noopField(event, 'payment_configuration_update');
        break;
      case WaWebhookEventType.PHONE_NUMBER_NAME_UPDATE:
        this.noopField(event, 'phone_number_name_update');
        break;
      case WaWebhookEventType.SMB_APP_STATE_SYNC:
        this.noopField(event, 'smb_app_state_sync');
        break;
      case WaWebhookEventType.SMB_MESSAGE_ECHOES:
        this.noopField(event, 'smb_message_echoes');
        break;
      case WaWebhookEventType.STANDBY:
        this.noopField(event, 'standby');
        break;
      case WaWebhookEventType.TEMPLATE_CATEGORY_UPDATE:
        await this.handleTemplateCategoryUpdate(event);
        break;
      case WaWebhookEventType.TEMPLATE_CORRECT_CATEGORY_DETECTION:
        await this.handleTemplateCategoryUpdate(event);
        break;
      case WaWebhookEventType.TRACKING_EVENTS:
        this.noopField(event, 'tracking_events');
        break;
      case WaWebhookEventType.USER_PREFERENCES:
        this.noopField(event, 'user_preferences');
        break;
      case WaWebhookEventType.OTHER:
        this.noopField(event, 'other');
        break;
      default: {
        const _exhaustive: never = event.eventType;
        this.logger.warn(
          `wa-webhook ${event.id}: unhandled eventType=${String(_exhaustive)}`,
        );
      }
    }
  }

  private noopField(event: WaWebhookEvent, field: string): void {
    this.logger.debug(
      `wa-webhook ${event.id} field=${field} acknowledged (no-op handler)`,
    );
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
          const msgType =
            (msg['type'] as string) ?? MetaInboundMessageType.UNKNOWN;
          const textBody = this.extractInboundBody(msg, msgType);
          const ts = msg['timestamp'] as string;
          const timestamp = ts ? new Date(parseInt(ts, 10) * 1000) : new Date();

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
              {
                contactName: conversation.contactName,
                contactPhone: conversation.contactPhone,
              },
            );
          }
        }
      }
    }
  }

  /** Switch on Meta inbound message type; unknown types still persist a placeholder. */
  private extractInboundBody(
    msg: Record<string, unknown>,
    msgType: string,
  ): string | null {
    switch (msgType) {
      case MetaInboundMessageType.TEXT:
        return (
          (msg['text'] as Record<string, string> | undefined)?.['body'] ?? null
        );
      case MetaInboundMessageType.IMAGE:
      case MetaInboundMessageType.AUDIO:
      case MetaInboundMessageType.VIDEO:
      case MetaInboundMessageType.DOCUMENT:
      case MetaInboundMessageType.STICKER:
        return (
          (msg[msgType] as Record<string, string> | undefined)?.['caption'] ??
          `[${msgType}]`
        );
      case MetaInboundMessageType.LOCATION:
        return '[location]';
      case MetaInboundMessageType.CONTACTS:
        return '[contacts]';
      case MetaInboundMessageType.INTERACTIVE:
        return '[interactive]';
      case MetaInboundMessageType.BUTTON:
        return (
          (msg['button'] as Record<string, string> | undefined)?.['text'] ??
          '[button]'
        );
      case MetaInboundMessageType.REACTION:
        return '[reaction]';
      case MetaInboundMessageType.ORDER:
        return '[order]';
      case MetaInboundMessageType.SYSTEM:
        return '[system]';
      case MetaInboundMessageType.UNKNOWN:
      case MetaInboundMessageType.UNSUPPORTED:
        return `[${msgType}]`;
      default:
        this.logger.debug(`inbound message type=${msgType} (unlisted)`);
        return (
          (msg['text'] as Record<string, string> | undefined)?.['body'] ??
          `[${msgType}]`
        );
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
            if (mappedStatus === 'failed') {
              const extracted = extractStatusFailure(statusUpdate);
              message.failureCode = extracted.code;
              message.failureReason = extracted.reason;
            } else {
              message.failureCode = null;
              message.failureReason = null;
            }
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
        const templateLang = value['message_template_language'] as
          | string
          | undefined;
        const templateStatus = value['event'] as string | undefined;
        const reason = value['reason'] as string | undefined;

        if (!templateName || !templateStatus) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        const normalized = templateStatus.toUpperCase();
        switch (normalized) {
          case MetaTemplateStatusEvent.APPROVED:
          case MetaTemplateStatusEvent.REJECTED:
          case MetaTemplateStatusEvent.PENDING:
          case MetaTemplateStatusEvent.PAUSED:
          case MetaTemplateStatusEvent.DISABLED: {
            const where: {
              workspaceId: string;
              name: string;
              language?: string;
            } = { workspaceId, name: templateName };
            if (templateLang) where.language = templateLang;

            const template = await this.templates.findOne({ where });
            if (template) {
              template.status = normalized as WaTemplate['status'];
              if (reason) template.rejectionReason = reason;
              if (normalized === MetaTemplateStatusEvent.APPROVED) {
                template.rejectionReason = null;
              }
              await this.templates.save(template);
            }
            break;
          }
          case MetaTemplateStatusEvent.PENDING_DELETION:
          case MetaTemplateStatusEvent.DELETED: {
            const where: {
              workspaceId: string;
              name: string;
              language?: string;
            } = { workspaceId, name: templateName };
            if (templateLang) where.language = templateLang;

            const template = await this.templates.findOne({ where });
            if (template) {
              await this.templates.softRemove(template);
              this.logger.log(
                `Removed local template after Meta ${normalized}: ${templateName}` +
                  (templateLang ? `/${templateLang}` : ''),
              );
            }
            break;
          }
          case MetaTemplateStatusEvent.LIMIT_EXCEEDED:
          case MetaTemplateStatusEvent.IN_APPEAL:
          case MetaTemplateStatusEvent.REINSTATED:
          case MetaTemplateStatusEvent.FLAGGED:
            this.logger.debug(
              `message_template_status_update event=${normalized} acknowledged (no-op persist) name=${templateName}`,
            );
            break;
          default:
            this.logger.debug(
              `message_template_status_update event=${normalized} (unlisted) name=${templateName}`,
            );
            break;
        }
      }
    }
  }

  /**
   * account_update: exhaustive switch on Meta `value.event`.
   * Terminal connection events disconnect CRM; informational events no-op.
   *
   * Note: for PARTNER_APP_INSTALLED, `entry.id` is often the **owner business id**,
   * while the WABA id lives in `value.waba_info.waba_id`. Prefer that when present.
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
        const wabaInfo = value['waba_info'] as
          | Record<string, unknown>
          | undefined;
        const metaWabaId =
          (typeof wabaInfo?.['waba_id'] === 'string'
            ? wabaInfo['waba_id']
            : undefined) ?? entry.id;

        this.logger.log(
          `account_update received: event=${accountEvent ?? 'unknown'} waba=${metaWabaId ?? 'unknown'}`,
          { eventId: event.id, accountEvent, metaWabaId, value },
        );

        if (!metaWabaId || !accountEvent) {
          this.logger.debug(
            `account_update missing waba/event — acknowledging no-op`,
          );
          continue;
        }

        const waba = await this.wabaAccounts.findOne({
          where: { metaWabaId },
        });
        if (!waba) {
          this.logger.warn(
            `account_update: no WabaAccount found for metaWabaId=${metaWabaId} (ok if connect still in flight)`,
          );
          continue;
        }

        switch (accountEvent) {
          case MetaAccountUpdateEvent.ACCOUNT_DELETED:
          case MetaAccountUpdateEvent.PARTNER_REMOVED:
          case MetaAccountUpdateEvent.PARTNER_APP_UNINSTALLED:
          case MetaAccountUpdateEvent.DISABLED:
          case MetaAccountUpdateEvent.DISCONNECTED:
          case MetaAccountUpdateEvent.ACCOUNT_OFFBOARDED:
            await this.disconnectWaba(waba, accountEvent, {
              softDeletePhones: true,
            });
            break;

          case MetaAccountUpdateEvent.PHONE_NUMBER_REMOVED:
            await this.handlePhoneNumberRemoved(waba, value);
            break;

          case MetaAccountUpdateEvent.SUSPENDED:
            waba.status = WabaAccountStatus.SUSPENDED;
            await this.wabaAccounts.save(waba);
            this.logger.log(`WabaAccount ${waba.id} status → SUSPENDED`);
            break;

          case MetaAccountUpdateEvent.DISABLED_UPDATE:
            await this.handleDisabledUpdate(waba, value);
            break;

          case MetaAccountUpdateEvent.PARTNER_ADDED:
          case MetaAccountUpdateEvent.PARTNER_APP_INSTALLED:
          case MetaAccountUpdateEvent.REINSTATED:
          case MetaAccountUpdateEvent.ACCOUNT_RECONNECTED:
            waba.status = WabaAccountStatus.ACTIVE;
            await this.wabaAccounts.save(waba);
            this.logger.log(
              `WabaAccount ${waba.id} status → ACTIVE (event=${accountEvent})`,
            );
            break;

          case MetaAccountUpdateEvent.ACCOUNT_RESTRICTION:
          case MetaAccountUpdateEvent.ACCOUNT_VIOLATION:
          case MetaAccountUpdateEvent.AD_ACCOUNT_LINKED:
          case MetaAccountUpdateEvent.AUTH_INTL_PRICE_ELIGIBILITY_UPDATE:
          case MetaAccountUpdateEvent.BUSINESS_PRIMARY_LOCATION_COUNTRY_UPDATE:
          case MetaAccountUpdateEvent.MM_LITE_TERMS_SIGNED:
          case MetaAccountUpdateEvent.PARTNER_CLIENT_CERTIFICATION_STATUS_UPDATE:
          case MetaAccountUpdateEvent.VOLUME_BASED_PRICING_TIER_UPDATE:
            this.logger.debug(
              `account_update event=${accountEvent} acknowledged (no-op)`,
            );
            break;

          default:
            this.logger.debug(
              `account_update event=${accountEvent} unlisted — acknowledged (no-op)`,
            );
            break;
        }
      }
    }
  }

  private async handleDisabledUpdate(
    waba: WabaAccount,
    value: Record<string, unknown>,
  ): Promise<void> {
    const banInfo = value['ban_info'] as Record<string, unknown> | undefined;
    const banState =
      typeof banInfo?.['waba_ban_state'] === 'string'
        ? banInfo['waba_ban_state']
        : undefined;

    switch (banState) {
      case MetaWabaBanState.REINSTATE:
        waba.status = WabaAccountStatus.ACTIVE;
        await this.wabaAccounts.save(waba);
        this.logger.log(
          `WabaAccount ${waba.id} status → ACTIVE (DISABLED_UPDATE REINSTATE)`,
        );
        break;
      case MetaWabaBanState.DISABLE:
      case MetaWabaBanState.SCHEDULE_FOR_DISABLE:
        waba.status = WabaAccountStatus.SUSPENDED;
        await this.wabaAccounts.save(waba);
        await this.deactivateWorkspaceWhatsapp(waba.workspaceId);
        this.logger.log(
          `WabaAccount ${waba.id} status → SUSPENDED (DISABLED_UPDATE ${banState})`,
        );
        break;
      default:
        this.logger.debug(
          `DISABLED_UPDATE ban_state=${banState ?? 'missing'} acknowledged (no-op beyond log)`,
        );
        break;
    }
  }

  private async disconnectWaba(
    waba: WabaAccount,
    accountEvent: string,
    opts: { softDeletePhones: boolean },
  ): Promise<void> {
    waba.status = WabaAccountStatus.DISCONNECTED;
    await this.wabaAccounts.save(waba);
    if (opts.softDeletePhones) {
      await this.phoneNumbers.softDelete({ wabaAccountId: waba.id });
    }
    // Soft-delete WABA so reconnect is not blocked by a leftover row
    // (connect only allows one non-deleted WABA per workspace).
    await this.wabaAccounts.softDelete({ id: waba.id });
    await this.deactivateWorkspaceWhatsapp(waba.workspaceId);
    this.logger.log(
      `WabaAccount ${waba.id} → DISCONNECTED+soft-deleted (event=${accountEvent})`,
    );
  }

  /**
   * Meta removed a sender from the WABA. Soft-delete our phone row; if none
   * remain active, treat the workspace as disconnected so Connect UI updates.
   */
  private async handlePhoneNumberRemoved(
    waba: WabaAccount,
    value: Record<string, unknown>,
  ): Promise<void> {
    const rawPhone = value['phone_number'];
    const digits =
      typeof rawPhone === 'string' ? rawPhone.replace(/\D/g, '') : '';

    const phones = await this.phoneNumbers.find({
      where: { wabaAccountId: waba.id },
    });

    for (const phone of phones) {
      const phoneDigits = phone.displayNumberE164.replace(/\D/g, '');
      const match =
        !digits ||
        phoneDigits === digits ||
        phoneDigits.endsWith(digits) ||
        digits.endsWith(phoneDigits);
      if (match) {
        await this.phoneNumbers.softDelete({ id: phone.id });
        this.logger.log(
          `PhoneNumber ${phone.id} soft-deleted (PHONE_NUMBER_REMOVED ${phone.displayNumberE164})`,
        );
      }
    }

    const remaining = await this.phoneNumbers.count({
      where: {
        wabaAccountId: waba.id,
        status: WaPhoneNumberStatus.ACTIVE,
      },
    });
    if (remaining === 0) {
      await this.disconnectWaba(
        waba,
        MetaAccountUpdateEvent.PHONE_NUMBER_REMOVED,
        { softDeletePhones: false },
      );
    }
  }

  private async deactivateWorkspaceWhatsapp(
    workspaceId: string,
  ): Promise<void> {
    await this.phoneNumbers.manager
      .createQueryBuilder()
      .update(WorkspaceService)
      .set({
        status: WorkspaceServiceStatus.PENDING_SETUP,
        activatedAt: null,
      })
      .where('workspace_id = :workspaceId AND service_key = :key', {
        workspaceId,
        key: 'whatsapp',
      })
      .execute();
  }

  /**
   * phone_quality_update: Meta fires this when a phone number's quality rating
   * changes (GREEN → YELLOW → RED) or messaging limits change.
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

  /**
   * `template_category_update` (and legacy `template_correct_category_detection`):
   * impending = `correct_category` + current `new_category`;
   * completed = `previous_category` + `new_category`.
   */
  private async handleTemplateCategoryUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
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
        if (!templateName) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        const template = await this.findLocalTemplate(workspaceId, {
          name: templateName,
          language: value['message_template_language'] as string | undefined,
          metaTemplateId: value['message_template_id'],
        });
        if (!template) {
          this.logger.debug(
            `template_category_update: no local row for ${templateName}`,
          );
          continue;
        }

        const previous = parseTemplateCategory(value['previous_category']);
        const correct = parseTemplateCategory(value['correct_category']);
        const next = parseTemplateCategory(value['new_category']);

        if (!template.submittedCategory) {
          template.submittedCategory = previous ?? template.category;
        }

        if (previous && next) {
          template.category = next;
          template.correctCategory = null;
          this.logger.log(
            `Template ${templateName} recategorized ${previous} → ${next}`,
          );
        } else if (correct && next && correct !== next) {
          template.category = next;
          template.correctCategory = correct;
          this.logger.log(
            `Template ${templateName} will recategorize ${next} → ${correct}`,
          );
        } else if (next) {
          template.category = next;
          template.correctCategory =
            correct && correct !== next ? correct : null;
        } else {
          this.logger.debug(
            `template_category_update acknowledged without category fields name=${templateName}`,
          );
          continue;
        }

        await this.templates.save(template);
      }
    }
  }

  private async findLocalTemplate(
    workspaceId: string,
    keys: {
      name: string;
      language?: string;
      metaTemplateId?: unknown;
    },
  ): Promise<WaTemplate | null> {
    const metaId =
      keys.metaTemplateId === undefined || keys.metaTemplateId === null
        ? null
        : String(keys.metaTemplateId);
    if (metaId) {
      const byMetaId = await this.templates.findOne({
        where: { workspaceId, metaTemplateId: metaId },
      });
      if (byMetaId) return byMetaId;
    }

    const language = keys.language
      ? normalizeTemplateLanguage(keys.language)
      : undefined;
    if (language) {
      const byLang = await this.templates.findOne({
        where: { workspaceId, name: keys.name, language },
      });
      if (byLang) return byLang;
    }

    return this.templates.findOne({
      where: { workspaceId, name: keys.name },
    });
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
      case MetaMessageStatus.SENT:
        return 'sent';
      case MetaMessageStatus.DELIVERED:
        return 'delivered';
      case MetaMessageStatus.READ:
        return 'read';
      case MetaMessageStatus.FAILED:
        return 'failed';
      case MetaMessageStatus.DELETED:
      case MetaMessageStatus.WARNING:
        this.logger.debug(`message status=${status} acknowledged (no-op map)`);
        return null;
      default:
        this.logger.debug(`message status=${status} unlisted (no-op map)`);
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

/** Pull Meta `statuses[].errors[0]` into a compact failure record. */
function extractStatusFailure(statusUpdate: Record<string, unknown>): {
  code: number | null;
  reason: string | null;
} {
  const errors = statusUpdate['errors'];
  if (!Array.isArray(errors) || errors.length === 0) {
    return { code: null, reason: null };
  }
  const first = errors[0] as Record<string, unknown>;
  const code = typeof first['code'] === 'number' ? first['code'] : null;
  const errorData = first['error_data'] as
    | { details?: string }
    | undefined;
  const reason =
    (typeof errorData?.details === 'string' && errorData.details) ||
    (typeof first['title'] === 'string' && first['title']) ||
    (typeof first['message'] === 'string' && first['message']) ||
    null;
  return { code, reason };
}
