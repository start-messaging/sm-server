import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { isCustomerCareWindowOpen } from '../../common/phone/normalize-wa-e164';
import { ContactOptedOutException } from '../exceptions/contact-opted-out.exception';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import type { MessageMediaType } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import {
  MetaGraphClient,
  MetaInteractivePayload,
  MetaMediaObject,
  MetaSendMessageInput,
} from './meta-graph.client';
import { WhatsappMediaService } from './whatsapp-media.service';
import { SendInteractiveDto } from '../dto/send-interactive.dto';

export interface SendTextInput {
  type: 'text';
  text: string;
}

export interface SendTemplateInput {
  type: 'template';
  templateName: string;
  templateLanguage: string;
  parameters?: Record<string, string>[];
  /** Public URL for the template header media (IMAGE/VIDEO/DOCUMENT). */
  headerMediaUrl?: string;
}

export interface SendMediaInput {
  type: 'image' | 'audio' | 'video' | 'document';
  /** Raw file buffer from the multipart upload (inbox composer). */
  buffer?: Buffer;
  mimeType?: string;
  filename?: string;
  /** Publicly hosted media URL, sent to Meta by link (flow builder media node). */
  url?: string;
  /** Optional caption (image, video, document only — Meta ignores for audio). */
  caption?: string;
}

export type SendMessageInput =
  | SendTextInput
  | SendTemplateInput
  | SendMediaInput;

export interface SendOptions {
  /**
   * Skip the opt-out gate. Only for the opt-out/opt-in confirmation reply,
   * which acknowledges the consent change itself and must reach the contact
   * even though they are now marked opted out.
   */
  bypassOptOutGate?: boolean;
  /** The workspace member user ID who triggered this send (for analytics). */
  senderId?: string;
}

/**
 * Orchestrates WhatsApp message sending.
 *
 * IMPORTANT: Tech Provider — NEVER debit wallet on send.
 * Meta bills conversations; we gate only on WABA connected + plan feature.
 */
@Injectable()
export class WhatsappSendService {
  private readonly logger = new Logger(WhatsappSendService.name);

  constructor(
    private readonly meta: MetaGraphClient,
    private readonly mediaService: WhatsappMediaService,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    @InjectRepository(WaMessage)
    private readonly messages: Repository<WaMessage>,
    @InjectRepository(WaTemplate)
    private readonly templates: Repository<WaTemplate>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    private readonly inboxRealtime: InboxRealtimeService,
  ) {}

  async send(
    workspaceId: string,
    conversationId: string,
    input: SendMessageInput,
    options?: SendOptions,
  ) {
    const waba = await this.requireWaba(workspaceId);
    const phone = await this.requireActivePhone(workspaceId);
    const conversation = await this.requireConversation(
      workspaceId,
      conversationId,
    );

    if (!options?.bypassOptOutGate) {
      await this.assertContactOptedIn(workspaceId, conversation);
    }

    if (
      input.type === 'text' ||
      input.type === 'image' ||
      input.type === 'audio' ||
      input.type === 'video' ||
      input.type === 'document'
    ) {
      if (!isCustomerCareWindowOpen(conversation.lastInboundAt)) {
        throw new AppException(
          {
            code: WA_ERR.MESSAGE_WINDOW_CLOSED,
            message:
              '24-hour customer-care window has closed. Use an approved template to re-open the conversation.',
          },
          403,
        );
      }
    }

    let templateBody: string | null = null;
    if (input.type === 'template') {
      const template = await this.requireApprovedTemplate(
        workspaceId,
        input.templateName,
        input.templateLanguage,
      );
      templateBody = fillTemplateBody(template, input.parameters);
    }

    const token = decryptToken(waba.accessTokenEncrypted);

    // ── Media: upload to R2 + Meta, then build the send payload ──────────────
    let mediaUploadMeta: {
      mediaType: MessageMediaType;
      metaMediaId: string;
      r2Key: string;
      mediaUrl: string | null;
      mediaMime: string;
      mediaFilename: string;
    } | null = null;

    if (
      (input.type === 'image' ||
        input.type === 'audio' ||
        input.type === 'video' ||
        input.type === 'document') &&
      input.buffer
    ) {
      mediaUploadMeta = await this.mediaService.uploadForSend({
        workspaceId,
        conversationId,
        phoneNumberId: phone.metaPhoneNumberId,
        accessToken: token,
        buffer: input.buffer,
        mimeType: input.mimeType ?? 'application/octet-stream',
        filename: input.filename ?? 'file',
      });
    }

    const metaBody = this.buildMetaPayload(
      conversation.contactPhone,
      input,
      mediaUploadMeta?.metaMediaId,
    );

    let metaMessageId: string;
    try {
      const result = await this.meta.sendMessage(
        phone.metaPhoneNumberId,
        metaBody,
        token,
      );
      metaMessageId = result.messages[0]?.id ?? '';
    } catch (err) {
      this.mapMetaSendError(err);
      throw err;
    }

    const message = this.messages.create({
      workspaceId,
      conversationId,
      direction: 'outbound',
      status: 'sent',
      body:
        input.type === 'text'
          ? input.text
          : input.type === 'template'
            ? templateBody
            : (input.caption ?? null),
      templateName: input.type === 'template' ? input.templateName : null,
      timestamp: new Date(),
      metaMessageId,
      senderId: options?.senderId ?? null,
      ...(mediaUploadMeta
        ? {
            mediaType: mediaUploadMeta.mediaType,
            mediaR2Key: mediaUploadMeta.r2Key,
            mediaUrl: mediaUploadMeta.mediaUrl,
            mediaMime: mediaUploadMeta.mediaMime,
            mediaFilename: mediaUploadMeta.mediaFilename,
          }
        : input.type !== 'text' && input.type !== 'template' && input.url
          ? {
              mediaType: input.type as MessageMediaType,
              mediaR2Key: null,
              mediaUrl: input.url,
              mediaMime: null,
              mediaFilename: input.filename ?? null,
            }
          : {
              mediaType: null,
              mediaR2Key: null,
              mediaUrl: null,
              mediaMime: null,
              mediaFilename: null,
            }),
    });
    await this.messages.save(message);

    conversation.lastMessageBody =
      message.body ??
      (message.mediaType
        ? `[${message.mediaType}]`
        : message.templateName
          ? `[Template: ${message.templateName}]`
          : null);
    conversation.lastMessageAt = message.timestamp;
    await this.conversations.save(conversation);

    await this.inboxRealtime.publishInboxUpdated(
      workspaceId,
      conversationId,
      'outbound',
    );

    return this.serializeMessage(message);
  }

  async sendInteractive(
    workspaceId: string,
    conversationId: string,
    dto: SendInteractiveDto,
    senderId?: string,
  ) {
    const waba = await this.requireWaba(workspaceId);
    const phone = await this.requireActivePhone(workspaceId);
    const conversation = await this.requireConversation(
      workspaceId,
      conversationId,
    );

    await this.assertContactOptedIn(workspaceId, conversation);

    if (!isCustomerCareWindowOpen(conversation.lastInboundAt)) {
      throw new AppException(
        {
          code: WA_ERR.MESSAGE_WINDOW_CLOSED,
          message:
            '24-hour customer-care window has closed. Use an approved template to re-open the conversation.',
        },
        403,
      );
    }

    const token = decryptToken(waba.accessTokenEncrypted);
    const to = conversation.contactPhone.replace(/^\+/, '');
    const interactive = this.buildInteractivePayload(dto);

    let metaMessageId: string;
    try {
      const result = await this.meta.sendInteractiveMessage(
        phone.metaPhoneNumberId,
        to,
        interactive,
        token,
      );
      metaMessageId = result.messages[0]?.id ?? '';
    } catch (err) {
      this.mapMetaSendError(err);
      throw err;
    }

    const messageType =
      dto.interactiveType === 'button'
        ? ('interactive_button' as const)
        : ('interactive_list' as const);

    const message = this.messages.create({
      workspaceId,
      conversationId,
      direction: 'outbound',
      status: 'sent',
      body: dto.body,
      timestamp: new Date(),
      metaMessageId,
      templateName: null,
      mediaType: null,
      mediaR2Key: null,
      mediaUrl: null,
      mediaMime: null,
      mediaFilename: null,
      messageType,
      senderId: senderId ?? null,
      interactiveData: {
        interactiveType: dto.interactiveType,
        body: dto.body,
        buttons: dto.buttons,
        sections: dto.sections,
      },
    });
    await this.messages.save(message);

    conversation.lastMessageBody = `[Interactive: ${dto.interactiveType}]`;
    conversation.lastMessageAt = message.timestamp;
    await this.conversations.save(conversation);

    await this.inboxRealtime.publishInboxUpdated(
      workspaceId,
      conversationId,
      'outbound',
    );

    return this.serializeMessage(message);
  }

  private buildInteractivePayload(
    dto: SendInteractiveDto,
  ): MetaInteractivePayload {
    const header = dto.header
      ? dto.header.type === 'text'
        ? { type: 'text' as const, text: dto.header.text ?? '' }
        : { type: dto.header.type, link: dto.header.mediaUrl ?? '' }
      : undefined;

    const base = {
      body: { text: dto.body },
      ...(header ? { header } : {}),
      ...(dto.footer ? { footer: { text: dto.footer } } : {}),
    };

    if (dto.interactiveType === 'button') {
      return {
        type: 'button',
        ...base,
        action: {
          buttons: (dto.buttons ?? []).map((b) => ({
            type: 'reply' as const,
            reply: { id: b.id, title: b.title },
          })),
        },
      };
    }

    return {
      type: 'list',
      ...base,
      action: {
        button: dto.buttonLabel ?? '',
        sections: (dto.sections ?? []).map((s) => ({
          ...(s.title ? { title: s.title } : {}),
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            ...(r.description ? { description: r.description } : {}),
          })),
        })),
      },
    };
  }

  private buildMetaPayload(
    to: string,
    input: SendMessageInput,
    metaMediaId?: string,
  ): MetaSendMessageInput {
    const phone = to.replace(/^\+/, '');

    if (input.type === 'text') {
      return { to: phone, type: 'text', text: { body: input.text } };
    }

    if (input.type === 'template') {
      const components: object[] = [];
      if (input.headerMediaUrl) {
        const url = input.headerMediaUrl.toLowerCase();
        const mediaType = url.match(/\.(mp4|3gpp?)$/i)
          ? 'video'
          : url.match(/\.(pdf|docx?|xlsx?|txt)$/i)
            ? 'document'
            : 'image';
        components.push({
          type: 'header',
          parameters: [{ type: mediaType, [mediaType]: { link: input.headerMediaUrl } }],
        });
      }
      if (input.parameters?.length) {
        components.push({
          type: 'body',
          parameters: input.parameters.map((p) => ({
            type: 'text' as const,
            text: p['text'] ?? Object.values(p)[0] ?? '',
          })),
        });
      }
      return {
        to: phone,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.templateLanguage },
          components: components.length ? components : undefined,
        },
      };
    }

    // Media types: image | audio | video | document. Uploaded buffers carry a
    // Meta media id; flow-builder sends reference a public URL by `link`.
    const ref: MetaMediaObject = metaMediaId
      ? { id: metaMediaId }
      : { link: input.url ?? '' };
    const caption = input.caption;
    const filename = input.filename;

    switch (input.type) {
      case 'image':
        return {
          to: phone,
          type: 'image',
          image: { ...ref, ...(caption ? { caption } : {}) },
        };
      case 'audio':
        return { to: phone, type: 'audio', audio: ref };
      case 'video':
        return {
          to: phone,
          type: 'video',
          video: { ...ref, ...(caption ? { caption } : {}) },
        };
      case 'document':
        return {
          to: phone,
          type: 'document',
          document: {
            ...ref,
            ...(caption ? { caption } : {}),
            ...(filename ? { filename } : {}),
          },
        };
    }
  }

  private async requireApprovedTemplate(
    workspaceId: string,
    name: string,
    language: string,
  ): Promise<WaTemplate> {
    const template = await this.templates.findOne({
      where: { workspaceId, name, language },
    });
    if (!template) {
      throw new AppException(
        {
          code: WA_ERR.TEMPLATE_NOT_FOUND,
          message: `Template "${name}" (${language}) was not found. Sync from Meta or create it first.`,
        },
        404,
      );
    }
    if (template.status === 'PENDING') {
      throw new AppException(
        {
          code: WA_ERR.TEMPLATE_PENDING_APPROVAL,
          message:
            'This template is still pending Meta approval. Wait for APPROVED before sending.',
        },
        422,
      );
    }
    if (template.status === 'REJECTED') {
      throw new AppException(
        {
          code: WA_ERR.TEMPLATE_REJECTED,
          message:
            template.rejectionReason ??
            'This template was rejected by Meta. Fix it on the Templates page.',
        },
        422,
      );
    }
    if (template.status !== 'APPROVED') {
      throw new AppException(
        {
          code: WA_ERR.TEMPLATE_NOT_FOUND,
          message: `Template "${name}" is ${template.status} and cannot be sent.`,
        },
        422,
      );
    }
    return template;
  }

  private mapMetaSendError(err: unknown): never {
    if (err instanceof AppException) {
      const details = (err.getResponse() as Record<string, unknown>)
        ?.details as
        | {
            code?: number;
            error_subcode?: number;
            error_data?: { details?: string };
            error_user_msg?: string;
            message?: string;
          }
        | undefined;
      const subcode = details?.error_subcode;
      const code = details?.code;
      const detailMsg =
        details?.error_user_msg ??
        details?.error_data?.details ??
        details?.message;

      // Payment / billing on WABA (Tech Provider — never wallet copy).
      if (
        code === 368 ||
        code === 131042 ||
        code === 131047 ||
        subcode === 2388093
      ) {
        throw new AppException(
          {
            code: WA_ERR.META_PAYMENT_REQUIRED,
            message:
              detailMsg ??
              'Meta payment method not configured on WABA. Add a card in WhatsApp Manager.',
            details,
          },
          402,
        );
      }
      if (subcode === 2388094 || subcode === 2388095) {
        throw new AppException(
          {
            code: WA_ERR.META_BILLING_ERROR,
            message: detailMsg ?? 'Meta billing error — payment declined.',
            details,
          },
          402,
        );
      }
      if (code === 131026) {
        throw new AppException(
          {
            code: WA_ERR.MESSAGE_UNDELIVERABLE,
            message:
              detailMsg ??
              'Message could not be delivered to this WhatsApp number.',
            details,
          },
          422,
        );
      }
      if (code === 130429 || code === 131048) {
        throw new AppException(
          {
            code: WA_ERR.PHONE_DAILY_LIMIT_REACHED,
            message:
              detailMsg ?? 'WhatsApp messaging limit reached. Try again later.',
            details,
          },
          429,
        );
      }
      // Prefer Meta user copy over generic "Invalid parameter".
      if (detailMsg) {
        throw new AppException(
          {
            code:
              (err.getResponse() as { code?: string })?.code ??
              WA_ERR.WABA_CONNECT_FAILED,
            message: detailMsg,
            details,
          },
          err.getStatus(),
        );
      }
    }
    throw err;
  }

  private async requireWaba(workspaceId: string): Promise<WabaAccount> {
    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: 'whatsapp' },
    });
    if (!waba) {
      throw new AppException(
        { code: WA_ERR.WABA_NOT_CONNECTED, message: 'WhatsApp not connected' },
        400,
      );
    }
    return waba;
  }

  private async requireActivePhone(workspaceId: string): Promise<PhoneNumber> {
    const phone = await this.phoneNumbers.findOne({
      where: { workspaceId, status: WaPhoneNumberStatus.ACTIVE },
    });
    if (!phone) {
      throw new AppException(
        {
          code: WA_ERR.WABA_NOT_CONNECTED,
          message: 'No active sender phone number',
        },
        400,
      );
    }
    return phone;
  }

  /**
   * Consent gate for every automated outbound. Resolves the contact by id when
   * the conversation is linked, otherwise by phone — campaign-created
   * conversations can still carry a null `contactId`, and legacy rows may store
   * the number without a leading `+`.
   */
  private async assertContactOptedIn(
    workspaceId: string,
    conversation: WaConversation,
  ): Promise<void> {
    const digits = conversation.contactPhone.replace(/^\+/, '');
    const phoneVariants =
      digits === conversation.contactPhone
        ? [conversation.contactPhone]
        : [conversation.contactPhone, digits];

    const contact = conversation.contactId
      ? await this.contacts.findOne({
          where: { id: conversation.contactId },
          select: { id: true, optedIn: true },
        })
      : await this.contacts.findOne({
          where: { workspaceId, phoneE164: In(phoneVariants) },
          select: { id: true, optedIn: true },
        });

    if (contact?.optedIn === false) {
      throw new ContactOptedOutException();
    }
  }

  private async requireConversation(
    workspaceId: string,
    conversationId: string,
  ): Promise<WaConversation> {
    const c = await this.conversations.findOne({
      where: { id: conversationId, workspaceId },
    });
    if (!c) {
      throw new AppException(
        { code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' },
        404,
      );
    }
    return c;
  }

  private serializeMessage(m: WaMessage) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      direction: m.direction,
      status: m.status,
      body: m.body,
      timestamp: m.timestamp.toISOString(),
      templateName: m.templateName,
      failureCode: m.failureCode,
      failureReason: m.failureReason,
      mediaType: m.mediaType ?? null,
      mediaUrl: m.mediaUrl ?? null,
      mediaMime: m.mediaMime ?? null,
      mediaFilename: m.mediaFilename ?? null,
      messageType: m.messageType ?? null,
      interactiveData: m.interactiveData ?? null,
    };
  }
}

/**
 * Substitute {{1}}, {{2}}… in the template BODY with the send-time parameter
 * texts so the inbox can show what the customer actually received.
 */
function fillTemplateBody(
  template: WaTemplate,
  parameters?: Record<string, string>[],
): string | null {
  const body = template.components.find((c) => c.type === 'BODY')?.text;
  if (!body) return null;
  if (!parameters?.length) return body;

  return body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => {
    const idx = Number(n) - 1;
    if (!Number.isFinite(idx) || idx < 0 || idx >= parameters.length) {
      return match;
    }
    const param = parameters[idx]!;
    const text = param['text'] ?? Object.values(param)[0];
    return text != null && String(text).length > 0 ? String(text) : match;
  });
}
