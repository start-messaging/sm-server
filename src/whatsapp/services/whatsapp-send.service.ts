import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { isCustomerCareWindowOpen } from '../../common/phone/normalize-wa-e164';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import type { MessageMediaType } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import {
  MetaGraphClient,
  MetaSendMessageInput,
  type MetaMediaMessageType,
} from './meta-graph.client';
import {
  WhatsappMediaService,
} from './whatsapp-media.service';

export interface SendTextInput {
  type: 'text';
  text: string;
}

export interface SendTemplateInput {
  type: 'template';
  templateName: string;
  templateLanguage: string;
  parameters?: Record<string, string>[];
}

export interface SendMediaInput {
  type: 'image' | 'audio' | 'video' | 'document';
  /** Raw file buffer from the multipart upload. */
  buffer: Buffer;
  mimeType: string;
  filename: string;
  /** Optional caption (image, video, document only — Meta ignores for audio). */
  caption?: string;
}

export type SendMessageInput =
  | SendTextInput
  | SendTemplateInput
  | SendMediaInput;

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
    private readonly inboxRealtime: InboxRealtimeService,
  ) {}

  async send(
    workspaceId: string,
    conversationId: string,
    input: SendMessageInput,
  ) {
    const waba = await this.requireWaba(workspaceId);
    const phone = await this.requireActivePhone(workspaceId);
    const conversation = await this.requireConversation(
      workspaceId,
      conversationId,
    );

    if (input.type === 'text' || input.type === 'image' || input.type === 'audio' || input.type === 'video' || input.type === 'document') {
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
      input.type === 'image' ||
      input.type === 'audio' ||
      input.type === 'video' ||
      input.type === 'document'
    ) {
      mediaUploadMeta = await this.mediaService.uploadForSend({
        workspaceId,
        conversationId,
        phoneNumberId: phone.metaPhoneNumberId,
        accessToken: token,
        buffer: input.buffer,
        mimeType: input.mimeType,
        filename: input.filename,
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
      ...(mediaUploadMeta
        ? {
            mediaType: mediaUploadMeta.mediaType,
            mediaR2Key: mediaUploadMeta.r2Key,
            mediaUrl: mediaUploadMeta.mediaUrl,
            mediaMime: mediaUploadMeta.mediaMime,
            mediaFilename: mediaUploadMeta.mediaFilename,
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
      return {
        to: phone,
        type: 'template',
        template: {
          name: input.templateName,
          language: { code: input.templateLanguage },
          components: input.parameters?.length
            ? [
                {
                  type: 'body',
                  parameters: input.parameters.map((p) => ({
                    type: 'text' as const,
                    text: p['text'] ?? Object.values(p)[0] ?? '',
                  })),
                },
              ]
            : undefined,
        },
      };
    }

    // Media types: image | audio | video | document
    const id = metaMediaId ?? '';
    const caption = (input as SendMediaInput).caption;
    const filename = (input as SendMediaInput).filename;

    switch (input.type as MetaMediaMessageType) {
      case 'image':
        return {
          to: phone,
          type: 'image',
          image: { id, ...(caption ? { caption } : {}) },
        };
      case 'audio':
        return { to: phone, type: 'audio', audio: { id } };
      case 'video':
        return {
          to: phone,
          type: 'video',
          video: { id, ...(caption ? { caption } : {}) },
        };
      case 'document':
        return {
          to: phone,
          type: 'document',
          document: {
            id,
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
