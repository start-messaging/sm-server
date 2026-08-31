import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { decryptToken } from '../crypto/token-encryption';
import {
  WaWebhookEvent,
  WaWebhookEventStatus,
  WaWebhookEventType,
} from '../entities/wa-webhook-event.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage, MessageStatus } from '../entities/wa-message.entity';
import { WaTemplate, TemplateStatus } from '../entities/wa-template.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaInboxSettings } from '../entities/wa-inbox-settings.entity';
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
import { normalizeWaE164 } from '../../common/phone/normalize-wa-e164';
import { WA_WEBHOOK_QUEUE } from './wa-webhook.constants';
import {
  WorkspaceMember,
  MemberStatus,
  WorkspaceRole,
} from '../../workspaces/entities/workspace-member.entity';
import { WaAssignmentEvent } from '../entities/wa-assignment-event.entity';
import { WaCampaign } from '../entities/wa-campaign.entity';
import {
  WhatsappMediaService,
  resolveMediaType,
} from '../services/whatsapp-media.service';
import { WhatsappSendService } from '../services/whatsapp-send.service';
import { WhatsappAutoRepliesService } from '../auto-replies/whatsapp-auto-replies.service';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { WaFlow } from '../entities/wa-flow.entity';
import { WaFlowSession } from '../entities/wa-flow-session.entity';
import { WhatsappFlowRunnerService } from '../services/whatsapp-flow-runner.service';

export interface WaWebhookJobData {
  eventId: string;
}

interface ReplyContext {
  text?: string;
  buttonId?: string;
  listRowId?: string;
}

/** Inbound keywords that revoke consent. Compared trimmed + upper-cased. */
const OPT_OUT_KEYWORDS = new Set([
  'STOP',
  'UNSUBSCRIBE',
  'OPT OUT',
  'OPTOUT',
  'CANCEL',
  'रुको',
  'بند',
]);

/** Inbound keywords that restore consent. Compared trimmed + upper-cased. */
const OPT_IN_KEYWORDS = new Set(['START', 'SUBSCRIBE', 'OPT IN', 'OPTIN']);

const OPT_OUT_CONFIRMATION =
  "You've been unsubscribed. Reply START to opt back in.";

const OPT_IN_CONFIRMATION = "You're subscribed again.";

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
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaInboxSettings)
    private readonly inboxSettings: Repository<WaInboxSettings>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(WaAssignmentEvent)
    private readonly assignmentEvents: Repository<WaAssignmentEvent>,
    @InjectRepository(WaCampaign)
    private readonly campaigns: Repository<WaCampaign>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WaFlow)
    private readonly flowRepo: Repository<WaFlow>,
    @InjectRepository(WaFlowSession)
    private readonly sessionRepo: Repository<WaFlowSession>,
    private readonly inboxRealtime: InboxRealtimeService,
    private readonly mediaService: WhatsappMediaService,
    private readonly sendService: WhatsappSendService,
    private readonly autoReplies: WhatsappAutoRepliesService,
    private readonly flowRunner: WhatsappFlowRunnerService,
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
        await this.handleAccountReviewUpdate(event);
        break;
      case WaWebhookEventType.SECURITY:
        this.noopField(event, 'security');
        break;
      case WaWebhookEventType.ACCOUNT_ALERTS:
        await this.handleAccountAlerts(event);
        break;
      case WaWebhookEventType.ACCOUNT_SETTINGS_UPDATE:
        this.noopField(event, 'account_settings_update');
        break;
      case WaWebhookEventType.AUTOMATIC_EVENTS:
        this.noopField(event, 'automatic_events');
        break;
      case WaWebhookEventType.BUSINESS_CAPABILITY_UPDATE:
        await this.handleBusinessCapabilityUpdate(event);
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
        await this.handleTemplateQualityUpdate(event);
        break;
      case WaWebhookEventType.MESSAGING_HANDOVERS:
        this.noopField(event, 'messaging_handovers');
        break;
      case WaWebhookEventType.PARTNER_SOLUTIONS:
        this.noopField(event, 'partner_solutions');
        break;
      case WaWebhookEventType.PAYMENT_CONFIGURATION_UPDATE:
        await this.handlePaymentConfigurationUpdate(event);
        break;
      case WaWebhookEventType.PHONE_NUMBER_NAME_UPDATE:
        await this.handlePhoneNumberNameUpdate(event);
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
        await this.handleUserPreferences(event);
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

  /**
   * account_review_update — Meta notifies when the WABA's app-review status
   * changes. We store the new status and update the ordering-guard timestamp.
   */
  private async handleAccountReviewUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const decision = value['decision'] as string | undefined;
        const metaWabaId = (value['waba_id'] as string | undefined) ?? entry.id;

        if (!metaWabaId || !decision) continue;

        this.logger.log(
          `account_review_update: waba=${metaWabaId} decision=${decision}`,
          { eventId: event.id },
        );

        await this.wabaAccounts.update(
          { metaWabaId },
          {
            accountReviewStatus: decision.toUpperCase(),
            verificationSyncedAt: new Date(),
          },
        );
      }
    }
  }

  /**
   * account_alerts — covers OBA (Official Business Account) eligibility and
   * payment-related account state changes.
   */
  private async handleAccountAlerts(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const alertType = value['alert_type'] as string | undefined;
        const metaWabaId = (value['waba_id'] as string | undefined) ?? entry.id;

        if (!metaWabaId) continue;

        this.logger.log(
          `account_alerts: waba=${metaWabaId} alert_type=${alertType ?? 'unknown'}`,
          { eventId: event.id },
        );

        // OBA grants/revocations
        if (alertType === 'BUSINESS_INITIATED_MESSAGING_REESTABLISHED') {
          await this.wabaAccounts.update(
            { metaWabaId },
            { isOfficialBusiness: true },
          );
        } else if (alertType === 'BUSINESS_INITIATED_MESSAGING_DISRUPTED') {
          await this.wabaAccounts.update(
            { metaWabaId },
            { isOfficialBusiness: false },
          );
        }

        // Payment failures signal no valid payment method
        if (alertType === 'PAYMENT_ISSUE') {
          await this.wabaAccounts.update(
            { metaWabaId },
            { metaPaymentReady: false },
          );
        }
      }
    }
  }

  /**
   * business_capability_update — carries updated `max_daily_conversations_per_business`
   * which replaces the deprecated `messaging_limit_tier` number.
   */
  private async handleBusinessCapabilityUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const rawLimit = value['max_daily_conversations_per_business'];
        const metaWabaId = (value['waba_id'] as string | undefined) ?? entry.id;

        if (!metaWabaId) continue;

        const newLimit =
          typeof rawLimit === 'number'
            ? rawLimit
            : typeof rawLimit === 'string'
              ? parseInt(rawLimit, 10)
              : undefined;

        if (newLimit === undefined || isNaN(newLimit)) continue;

        this.logger.log(
          `business_capability_update: waba=${metaWabaId} limit=${newLimit}`,
          { eventId: event.id },
        );

        // Update all active phone numbers under this WABA
        const waba = await this.wabaAccounts.findOne({
          where: { metaWabaId },
          select: { id: true },
        });
        if (!waba) continue;

        await this.phoneNumbers.update(
          { wabaAccountId: waba.id },
          { messagingLimitPerDay: newLimit, statusSyncedAt: new Date() },
        );
      }
    }
  }

  /**
   * payment_configuration_update — Meta sends this when the payment method
   * linked to the WABA changes (added, removed, expired).
   */
  private async handlePaymentConfigurationUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const metaWabaId = (value['waba_id'] as string | undefined) ?? entry.id;
        const eventType = value['event'] as string | undefined;

        if (!metaWabaId) continue;

        // 'PAYMENT_METHOD_ATTACHED' | 'PAYMENT_METHOD_EXPIRED' | 'PAYMENT_METHOD_DETACHED'
        const paymentReady =
          eventType === 'PAYMENT_METHOD_ATTACHED'
            ? true
            : eventType === 'PAYMENT_METHOD_EXPIRED' ||
                eventType === 'PAYMENT_METHOD_DETACHED'
              ? false
              : null;

        this.logger.log(
          `payment_configuration_update: waba=${metaWabaId} event=${eventType ?? 'unknown'} paymentReady=${String(paymentReady)}`,
          { eventId: event.id },
        );

        if (paymentReady !== null) {
          await this.wabaAccounts.update(
            { metaWabaId },
            { metaPaymentReady: paymentReady },
          );
        }
      }
    }
  }

  /**
   * phone_number_name_update — Meta notifies when a number's display-name
   * review decision changes (APPROVED / DECLINED / PENDING_REVIEW).
   */
  private async handlePhoneNumberNameUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const decision = value['decision'] as string | undefined;
        const displayPhone = value['display_phone_number'] as
          | string
          | undefined;
        const metaPhoneNumberId = value['phone_number_id'] as
          | string
          | undefined;

        if (!decision) continue;

        this.logger.log(
          `phone_number_name_update: phone=${displayPhone ?? metaPhoneNumberId ?? 'unknown'} decision=${decision}`,
          { eventId: event.id },
        );

        if (metaPhoneNumberId) {
          await this.phoneNumbers.update(
            { metaPhoneNumberId },
            {
              displayNameStatus: decision.toUpperCase(),
              statusSyncedAt: new Date(),
            },
          );
        }
      }
    }
  }

  /**
   * message_template_quality_update — Meta fires this when a template's
   * quality score shifts (HIGH → MEDIUM → LOW → PAUSED/DISABLED).
   * We mirror the new status back onto the local template row.
   */
  private async handleTemplateQualityUpdate(
    event: WaWebhookEvent,
  ): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const templateName = value['message_template_name'] as
          | string
          | undefined;
        const newQualityScore = value['new_quality_score'] as
          | string
          | undefined;
        const templateStatus = value['message_template_status'] as
          | string
          | undefined;

        if (!templateName) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        const template = await this.findLocalTemplate(workspaceId, {
          name: templateName,
        });
        if (!template) continue;

        this.logger.log(
          `message_template_quality_update: template=${templateName} qualityScore=${newQualityScore ?? 'unknown'} status=${templateStatus ?? 'unknown'}`,
          { eventId: event.id },
        );

        const update: Record<string, unknown> = {};
        if (newQualityScore)
          update['qualityScore'] = newQualityScore.toUpperCase();
        if (templateStatus) {
          const mapped = this.mapMetaTemplateStatus(templateStatus);
          if (mapped) update['status'] = mapped;
        }

        if (Object.keys(update).length) {
          await this.templates.update({ id: template.id }, update);
        }
      }
    }
  }

  /**
   * user_preferences — Meta sends opt-in/opt-out decisions from end-users
   * (e.g. a user clicked "Stop marketing messages" in a WhatsApp menu).
   * We honour their preference immediately by toggling `optedIn` on the contact.
   */
  private async handleUserPreferences(event: WaWebhookEvent): Promise<void> {
    const payload = event.payload;
    const entries = (payload['entry'] as unknown[]) ?? [];

    for (const entry of entries as Array<{
      id?: string;
      changes?: Array<{ value?: Record<string, unknown> }>;
    }>) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const value = change.value ?? {};
        const preferences = value['preferences'] as
          | Array<{ type?: string; preference?: string; phone_number?: string }>
          | undefined;
        if (!preferences?.length) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        for (const pref of preferences) {
          if (pref.type !== 'marketing_messages') continue;
          const phone = pref.phone_number;
          if (!phone) continue;

          let normalized: string;
          try {
            normalized = normalizeWaE164(phone);
          } catch {
            normalized = phone;
          }

          const optedIn = pref.preference !== 'optout';

          this.logger.log(
            `user_preferences: workspace=${workspaceId} phone=${normalized} optedIn=${String(optedIn)}`,
            { eventId: event.id },
          );

          await this.contacts.update(
            { workspaceId, phoneE164: normalized },
            { optedIn },
          );
        }
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
        const metaContacts =
          (value['contacts'] as Array<Record<string, string>>) ?? [];

        if (!metaMessages.length) continue;

        const workspaceId = await this.resolveWorkspaceId(event.wabaAccountId);
        if (!workspaceId) continue;

        for (const msg of metaMessages) {
          const rawFrom = msg['from'] as string;
          let contactPhone: string;
          try {
            contactPhone = normalizeWaE164(rawFrom);
          } catch {
            this.logger.warn(
              `inbound: could not normalize phone "${rawFrom}" — using raw`,
            );
            contactPhone = rawFrom;
          }

          const contactName = metaContacts[0]
            ? ((metaContacts[0] as unknown as { profile?: { name?: string } })
                ?.profile?.name ?? null)
            : null;
          const wamid = msg['id'] as string;
          const msgType =
            (msg['type'] as string) ?? MetaInboundMessageType.UNKNOWN;
          const textBody = this.extractInboundBody(msg, msgType);
          const ts = msg['timestamp'] as string;
          const timestamp = ts ? new Date(parseInt(ts, 10) * 1000) : new Date();

          const contact = await this.upsertInboundContact(
            workspaceId,
            contactPhone,
            contactName,
          );

          let conversation = await this.findConversationForInbound(
            workspaceId,
            contactPhone,
            rawFrom,
          );
          if (!conversation) {
            conversation = this.conversations.create({
              workspaceId,
              contactPhone,
              contactName: contactName,
              contactId: contact.id,
              lastInboundAt: timestamp,
              unreadCount: 1,
              lastMessageBody: textBody,
              lastMessageAt: timestamp,
              status: 'open',
            });
            await this.conversations.save(conversation);
          } else {
            conversation.lastInboundAt = timestamp;
            conversation.unreadCount += 1;
            conversation.lastMessageBody = textBody;
            conversation.lastMessageAt = timestamp;
            if (!conversation.contactId) conversation.contactId = contact.id;
            if (contactName) conversation.contactName = contactName;
            if (conversation.status === 'resolved') {
              conversation.status = 'open';
              conversation.resolvedAt = null;
              conversation.resolvedByUserId = null;
            }
            await this.conversations.save(conversation);
          }

          await this.maybeAutoAssign(workspaceId, conversation);

          const existing = await this.messages.findOne({
            where: { metaMessageId: wamid },
          });
          if (!existing) {
            const isMediaType =
              msgType === MetaInboundMessageType.IMAGE ||
              msgType === MetaInboundMessageType.AUDIO ||
              msgType === MetaInboundMessageType.VIDEO ||
              msgType === MetaInboundMessageType.DOCUMENT ||
              msgType === MetaInboundMessageType.STICKER;

            const isInteractive =
              msgType === MetaInboundMessageType.INTERACTIVE;

            let interactiveData:
              | import('../entities/wa-message.entity').InteractiveData
              | null = null;
            if (isInteractive) {
              const interactive = msg['interactive'] as
                | Record<string, unknown>
                | undefined;
              const interactiveType = interactive?.['type'] as
                | string
                | undefined;
              if (interactiveType === 'button_reply') {
                const reply = interactive?.['button_reply'] as
                  | Record<string, string>
                  | undefined;
                interactiveData = {
                  interactiveType: 'button_reply',
                  replyId: reply?.['id'],
                  replyTitle: reply?.['title'],
                };
              } else if (interactiveType === 'list_reply') {
                const reply = interactive?.['list_reply'] as
                  | Record<string, string>
                  | undefined;
                interactiveData = {
                  interactiveType: 'list_reply',
                  replyId: reply?.['id'],
                  replyTitle: reply?.['title'],
                };
              }
            }

            const message = this.messages.create({
              workspaceId,
              conversationId: conversation.id,
              direction: 'inbound',
              status: 'delivered',
              body: textBody,
              timestamp,
              metaMessageId: wamid,
              templateName: null,
              mediaType: isMediaType ? msgType : null,
              mediaR2Key: null,
              mediaUrl: null,
              mediaMime: null,
              mediaFilename: null,
              messageType: isInteractive ? 'interactive_reply' : null,
              interactiveData,
            });
            await this.messages.save(message);

            // Async media download — do NOT await in the main flow so the
            // webhook 200 is never delayed. We update the row after saving.
            if (isMediaType) {
              void this.downloadInboundMedia(
                msg,
                msgType,
                workspaceId,
                conversation.id,
                wamid,
                event.wabaAccountId,
                message.id,
              );
            }

            await this.inboxRealtime.publishInboxUpdated(
              workspaceId,
              conversation.id,
              'inbound',
              {
                contactName: conversation.contactName,
                contactPhone: conversation.contactPhone,
              },
            );

            const optOutHandled = await this.maybeHandleOptOut(
              workspaceId,
              conversation,
              contact,
              textBody,
            );

            if (!optOutHandled) {
              const consumed = await this.maybeAdvanceFlow(
                message,
                contact,
                conversation,
              );
              if (!consumed) {
                await this.maybeSendAutoReply(
                  workspaceId,
                  conversation,
                  contact,
                  textBody,
                );
              }
            }
          }
        }
      }
    }
  }

  /**
   * Fetches inbound media from Meta CDN and uploads to R2 in the background.
   * Updates the WaMessage row on success; logs and keeps placeholder on failure.
   * Called with `void` — must never propagate exceptions to the job processor.
   */
  private async downloadInboundMedia(
    msg: Record<string, unknown>,
    msgType: string,
    workspaceId: string,
    conversationId: string,
    wamid: string,
    wabaAccountId: string | null,
    messageId: string,
  ): Promise<void> {
    try {
      const mediaObj = msg[msgType] as Record<string, string> | undefined;
      const mediaId = mediaObj?.['id'];
      if (!mediaId) {
        this.logger.warn(
          `inbound media: no id in ${msgType} object for wamid=${wamid}`,
        );
        return;
      }

      // Resolve WABA access token.
      if (!wabaAccountId) return;
      const waba = await this.wabaAccounts.findOne({
        where: { id: wabaAccountId },
      });
      if (!waba?.accessTokenEncrypted) return;
      const accessToken = decryptToken(waba.accessTokenEncrypted);

      const fallbackMime = mediaObj['mime_type'] ?? undefined;
      const fallbackFilename = mediaObj['filename'] ?? undefined;

      const result = await this.mediaService.downloadAndStore({
        workspaceId,
        conversationId,
        wamid,
        mediaId,
        accessToken,
        fallbackMime,
        fallbackFilename,
      });

      if (result) {
        const mediaType = resolveMediaType(result.mediaMime);
        await this.messages.update(messageId, {
          mediaR2Key: result.r2Key,
          mediaUrl: result.mediaUrl,
          mediaMime: result.mediaMime,
          mediaType,
          ...(fallbackFilename ? { mediaFilename: fallbackFilename } : {}),
        });
        this.logger.debug(
          `inbound media stored: wamid=${wamid} r2Key=${result.r2Key}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `downloadInboundMedia failed for wamid=${wamid}: ${String(err)}`,
      );
    }
  }

  /**
   * Resolve an inbound conversation by E.164 or the raw Meta `from` digits
   * (pre-Slice 1 rows). Migrates the stored phone to E.164 when we find a
   * legacy row — the E.164 lookup already missed, so this rename is unique.
   */
  private async findConversationForInbound(
    workspaceId: string,
    e164: string,
    rawFrom: string,
  ): Promise<WaConversation | null> {
    const byE164 = await this.conversations.findOne({
      where: { workspaceId, contactPhone: e164 },
    });
    if (byE164) return byE164;

    const candidates = new Set<string>();
    if (rawFrom && rawFrom !== e164) candidates.add(rawFrom);
    const digits = e164.replace(/^\+/, '');
    if (digits !== e164) candidates.add(digits);

    for (const phone of candidates) {
      const found = await this.conversations.findOne({
        where: { workspaceId, contactPhone: phone },
      });
      if (found) {
        found.contactPhone = e164;
        return found;
      }
    }
    return null;
  }

  private async upsertInboundContact(
    workspaceId: string,
    phoneE164: string,
    name: string | null,
  ): Promise<WaContact> {
    let contact = await this.contacts.findOne({
      where: { workspaceId, phoneE164 },
    });
    if (!contact) {
      const digits = phoneE164.replace(/^\+/, '');
      if (digits !== phoneE164) {
        contact = await this.contacts.findOne({
          where: { workspaceId, phoneE164: digits },
        });
        if (contact) {
          contact.phoneE164 = phoneE164;
          if (name && !contact.name) contact.name = name;
          await this.contacts.save(contact);
          return contact;
        }
      }
      contact = this.contacts.create({
        workspaceId,
        phoneE164,
        name: name ?? null,
        source: 'whatsapp',
        optedIn: true,
        tags: [],
        attributes: {},
      });
      await this.contacts.save(contact);
    } else if (name && !contact.name) {
      contact.name = name;
      await this.contacts.save(contact);
    }
    return contact;
  }

  /**
   * Consent keywords (STOP / START and their locale equivalents) take priority
   * over every other inbound handler — they must flip `optedIn` and acknowledge
   * even when an auto-reply rule would also match the same text. Returns true
   * when the message was a consent command so the caller stops processing it.
   */
  private async maybeHandleOptOut(
    workspaceId: string,
    conversation: WaConversation,
    contact: WaContact,
    inboundText: string | null,
  ): Promise<boolean> {
    const keyword = inboundText?.trim().toUpperCase();
    if (!keyword) return false;

    const optingOut = OPT_OUT_KEYWORDS.has(keyword);
    const optingIn = !optingOut && OPT_IN_KEYWORDS.has(keyword);
    if (!optingOut && !optingIn) return false;

    contact.optedIn = optingIn;
    await this.contacts.save(contact);
    this.logger.log(
      `contact ${contact.id} ${optingOut ? 'opted out' : 'opted back in'} ` +
        `(keyword: ${keyword})`,
    );

    // Plain text, not a template: this is a reply to an inbound message so the
    // 24-hour window is open by definition. It bypasses the send service's
    // opt-out gate because it acknowledges the consent change itself.
    try {
      await this.sendService.send(
        workspaceId,
        conversation.id,
        {
          type: 'text',
          text: optingOut ? OPT_OUT_CONFIRMATION : OPT_IN_CONFIRMATION,
        },
        { bypassOptOutGate: true },
      );
    } catch (err) {
      this.logger.warn(
        `opt-${optingOut ? 'out' : 'in'} confirmation failed on conversation ` +
          `${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return true;
  }

  /**
   * Keyword auto-reply. Fires only when the workspace plan grants
   * `keyword_autoreplies`, the contact is still opted in, and no outbound
   * message (agent or earlier auto-reply) landed in this conversation within
   * `autoReplyDelaySeconds` — the grace window that keeps the bot from talking
   * over a human. Sends through WhatsappSendService, which owns the 24-hour
   * window / opt-out / template checks; a rejected send is logged, never
   * propagated, so a bad rule can't fail the webhook job.
   */
  private async maybeSendAutoReply(
    workspaceId: string,
    conversation: WaConversation,
    contact: WaContact,
    inboundText: string | null,
  ): Promise<void> {
    if (!inboundText?.trim() || !contact.optedIn) return;

    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
      relations: { plan: true },
    });
    if (!workspace?.plan?.features?.[PLAN_FEATURE_KEYS.keywordAutoreplies]) {
      return;
    }

    const settings = await this.inboxSettings.findOne({
      where: { workspaceId },
    });
    const delaySeconds = settings?.autoReplyDelaySeconds ?? 0;
    if (delaySeconds > 0) {
      const since = new Date(Date.now() - delaySeconds * 1000);
      const recentOutbound = await this.messages
        .createQueryBuilder('m')
        .where('m.conversation_id = :conversationId', {
          conversationId: conversation.id,
        })
        .andWhere('m.direction = :direction', { direction: 'outbound' })
        .andWhere('m.timestamp >= :since', { since })
        .getExists();
      if (recentOutbound) return;
    }

    const rule = await this.autoReplies.findMatchingRule(
      workspaceId,
      inboundText,
    );
    if (!rule) return;

    try {
      if (rule.replyType === 'text') {
        await this.sendService.send(workspaceId, conversation.id, {
          type: 'text',
          text: rule.replyText ?? '',
        });
      } else {
        await this.sendService.send(workspaceId, conversation.id, {
          type: 'template',
          templateName: rule.replyTemplateName ?? '',
          templateLanguage: rule.replyTemplateLanguage ?? '',
        });
      }
      this.logger.log(
        `auto-reply rule ${rule.id} fired on conversation ${conversation.id}`,
      );
    } catch (err) {
      this.logger.warn(
        `auto-reply rule ${rule.id} send failed on conversation ` +
          `${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Round-robin auto-assign: picks the next eligible member after
   * `lastRoutedUserId` in a stable order (joinedAt ASC, userId ASC) and
   * assigns the conversation, writing an audit event and firing SSE.
   *
   * Eligible: ACTIVE members with role AGENT or MANAGER whose `inboxAvailable`
   * flag is true. Skips if the conversation is already assigned.
   */
  private async maybeAutoAssign(
    workspaceId: string,
    conversation: WaConversation,
  ): Promise<void> {
    if (conversation.assignedToUserId !== null) return;

    const settings = await this.inboxSettings.findOne({
      where: { workspaceId },
    });
    if (!settings || !settings.roundRobinEnabled) return;

    const eligible = await this.members
      .createQueryBuilder('m')
      .where('m.workspace_id = :workspaceId', { workspaceId })
      .andWhere('m.status = :status', { status: MemberStatus.ACTIVE })
      .andWhere('m.role IN (:...roles)', {
        roles: [WorkspaceRole.AGENT, WorkspaceRole.MANAGER],
      })
      .andWhere('m.inbox_available = true')
      .orderBy('COALESCE(m.joined_at, m.created_at)', 'ASC')
      .addOrderBy('m.user_id', 'ASC')
      .getMany();

    if (eligible.length === 0) {
      this.logger.debug(
        `round-robin: no eligible members for workspace ${workspaceId}`,
      );
      return;
    }

    // Find position of the last routed user, then advance by 1 (wrap around).
    const lastIdx = settings.lastRoutedUserId
      ? eligible.findIndex((m) => m.userId === settings.lastRoutedUserId)
      : -1;
    const nextIdx = (lastIdx + 1) % eligible.length;
    const picked = eligible[nextIdx];
    if (!picked) return; // should never happen (length > 0), but satisfies TS

    conversation.assignedToUserId = picked.userId;
    await this.conversations.save(conversation);

    if (conversation.contactId) {
      await this.contacts.update(conversation.contactId, {
        assignedToUserId: picked.userId,
      });
    }

    const evt = this.assignmentEvents.create({
      workspaceId,
      conversationId: conversation.id,
      actorUserId: null,
      actorType: 'workspace_member',
      action: 'ASSIGN',
      fromUserId: null,
      toUserId: picked.userId,
    });
    await this.assignmentEvents.save(evt);

    settings.lastRoutedUserId = picked.userId;
    await this.inboxSettings.save(settings);

    await this.inboxRealtime.publishInboxUpdated(
      workspaceId,
      conversation.id,
      'assignment',
    );

    this.logger.log(
      `round-robin: conversation ${conversation.id} → user ${picked.userId}`,
    );
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
      case MetaInboundMessageType.INTERACTIVE: {
        const interactive = msg['interactive'] as
          | Record<string, unknown>
          | undefined;
        if (interactive) {
          const interactiveType = interactive['type'] as string | undefined;
          if (interactiveType === 'button_reply') {
            const reply = interactive['button_reply'] as
              | Record<string, string>
              | undefined;
            if (reply?.['title']) return reply['title'];
          }
          if (interactiveType === 'list_reply') {
            const reply = interactive['list_reply'] as
              | Record<string, string>
              | undefined;
            if (reply?.['title']) return reply['title'];
          }
        }
        return '[interactive]';
      }
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
            const prevStatus = message.status;
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
            await this.incrementCampaignStats(
              message,
              mappedStatus,
              prevStatus,
            );
          }
        }
      }
    }
  }

  /**
   * Rolls up a status advancement into the parent campaign's stats counters.
   * Uses a fresh reload of the campaign row to avoid clobbering `sent` written
   * concurrently by the campaign processor.
   *
   * Rules (once per message lifecycle, never double-count processor's failed):
   *   delivered → stats.delivered += 1
   *   read      → stats.read += 1; ensure delivered >= read
   *   failed    → stats.failed += 1 only when prev was sent or delivered
   */
  private async incrementCampaignStats(
    message: WaMessage,
    newStatus: MessageStatus,
    prevStatus: MessageStatus,
  ): Promise<void> {
    const campaignId =
      'campaignId' in message
        ? (message as { campaignId?: string | null }).campaignId
        : null;
    if (!campaignId) return;

    if (
      newStatus !== 'delivered' &&
      newStatus !== 'read' &&
      newStatus !== 'failed'
    ) {
      return;
    }
    if (
      newStatus === 'failed' &&
      prevStatus !== 'sent' &&
      prevStatus !== 'delivered'
    ) {
      return;
    }

    // Reload to get the latest `sent` count from the campaign processor.
    const campaign = await this.campaigns.findOne({
      where: { id: campaignId },
    });
    if (!campaign) {
      this.logger.warn(
        `incrementCampaignStats: campaign ${campaignId} not found for message ${message.id}`,
      );
      return;
    }

    const s = { ...campaign.stats };
    if (newStatus === 'delivered') {
      s.delivered += 1;
    } else if (newStatus === 'read') {
      s.read += 1;
      // Ensure delivered is at least as high as read (guards out-of-order webhooks).
      if (s.delivered < s.read) s.delivered = s.read;
    } else {
      s.failed += 1;
    }
    campaign.stats = s;
    await this.campaigns.save(campaign);
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
              template.status = normalized;
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

  private mapMetaTemplateStatus(status: string): TemplateStatus | null {
    const s = status.toUpperCase();
    const valid: Record<string, TemplateStatus> = {
      APPROVED: 'APPROVED',
      PENDING: 'PENDING',
      REJECTED: 'REJECTED',
      PAUSED: 'PAUSED',
      DISABLED: 'DISABLED',
    };
    return valid[s] ?? null;
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

  // ── Flow runner state machine ───────────────────────────────────────────────

  private extractReply(message: WaMessage): ReplyContext {
    if (message.messageType === 'interactive_reply') {
      if (message.interactiveData?.interactiveType === 'button_reply') {
        return { buttonId: message.interactiveData.replyId };
      }
      if (message.interactiveData?.interactiveType === 'list_reply') {
        return { listRowId: message.interactiveData.replyId };
      }
    }
    return { text: message.body ?? '' };
  }

  private async maybeAdvanceFlow(
    message: WaMessage,
    contact: WaContact,
    conversation: WaConversation,
  ): Promise<boolean> {
    const session = await this.sessionRepo.findOne({
      where: { conversationId: conversation.id, status: 'active' },
    });

    if (session && session.waitingForReply) {
      const replyCtx = this.extractReply(message);
      session.variables = {
        ...session.variables,
        reply: replyCtx.text ?? replyCtx.buttonId ?? replyCtx.listRowId ?? '',
      };
      await this.resumeSession(session, replyCtx, conversation, contact);
      return true;
    }

    if (!session) {
      const flow = await this.matchTrigger(
        conversation.workspaceId,
        message,
        conversation,
      );
      if (!flow) return false;
      const newSession = await this.createSession(flow, conversation);
      const triggerNode = flow.nodes.find((n) => n.type === 'trigger');
      if (!triggerNode) {
        newSession.status = 'completed';
        await this.sessionRepo.save(newSession);
        return true;
      }
      await this.flowRunner.executeFrom(
        newSession,
        flow,
        triggerNode.id,
        conversation,
        contact,
      );
      return true;
    }

    return false;
  }

  private async matchTrigger(
    workspaceId: string,
    message: WaMessage,
    conversation: WaConversation,
  ): Promise<WaFlow | null> {
    const flows = await this.flowRepo.find({
      where: { workspaceId, status: 'active' },
    });
    for (const flow of flows) {
      switch (flow.triggerType) {
        case 'manual':
          // Manual flows never auto-start from inbound messages.
          break;
        case 'first_message':
          if (conversation.unreadCount === 1) return flow;
          break;
        case 'any_inbound':
          return flow;
        case 'keyword':
          if (
            flow.triggerKeywords.some((kw) =>
              message.body?.toLowerCase().includes(kw.toLowerCase()),
            )
          ) {
            return flow;
          }
          break;
      }
    }
    return null;
  }

  private async createSession(
    flow: WaFlow,
    conversation: WaConversation,
  ): Promise<WaFlowSession> {
    const triggerNode = flow.nodes.find((n) => n.type === 'trigger');
    const session = this.sessionRepo.create({
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      flowId: flow.id,
      currentNodeId: triggerNode?.id ?? '',
      status: 'active',
      variables: {},
      waitingForReply: false,
      nextFireAt: null,
    });
    return this.sessionRepo.save(session);
  }

  private async resumeSession(
    session: WaFlowSession,
    replyCtx: ReplyContext,
    conversation: WaConversation,
    contact: WaContact,
  ): Promise<void> {
    const flow = await this.flowRepo.findOne({ where: { id: session.flowId } });
    if (!flow) {
      session.status = 'exited';
      await this.sessionRepo.save(session);
      return;
    }

    session.waitingForReply = false;
    await this.sessionRepo.save(session);

    const node = flow.nodes.find((n) => n.id === session.currentNodeId);
    if (!node) {
      session.status = 'completed';
      await this.sessionRepo.save(session);
      return;
    }

    let nextId: string | null;

    if (node.type === 'button_branch') {
      const options =
        (node.data['options'] as
          | Array<{ id: string; title: string }>
          | undefined) ?? [];
      const matchedId = options.find((o) => o.id === replyCtx.buttonId)?.id;
      nextId =
        this.flowRunner.followEdge(flow, node.id, matchedId) ??
        this.flowRunner.followEdge(flow, node.id);
    } else if (node.type === 'list_branch') {
      const options =
        (node.data['options'] as
          | Array<{ id: string; title: string }>
          | undefined) ?? [];
      const matchedId = options.find((o) => o.id === replyCtx.listRowId)?.id;
      nextId =
        this.flowRunner.followEdge(flow, node.id, matchedId) ??
        this.flowRunner.followEdge(flow, node.id);
    } else {
      nextId =
        this.flowRunner.followEdge(flow, node.id, 'replied') ??
        this.flowRunner.followEdge(flow, node.id);
    }

    if (nextId) {
      await this.flowRunner.executeFrom(
        session,
        flow,
        nextId,
        conversation,
        contact,
      );
    } else if (session.status === 'active') {
      session.status = 'completed';
      await this.sessionRepo.save(session);
    }
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
  const errorData = first['error_data'] as { details?: string } | undefined;
  const reason =
    (typeof errorData?.details === 'string' && errorData.details) ||
    (typeof first['title'] === 'string' && first['title']) ||
    (typeof first['message'] === 'string' && first['message']) ||
    null;
  return { code, reason };
}
