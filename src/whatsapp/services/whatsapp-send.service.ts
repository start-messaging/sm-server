import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { InboxRealtimeService } from '../realtime/inbox-realtime.service';
import { MetaGraphClient, MetaSendMessageInput } from './meta-graph.client';

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

export type SendMessageInput = SendTextInput | SendTemplateInput;

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

    if (input.type === 'template') {
      await this.requireApprovedTemplate(
        workspaceId,
        input.templateName,
        input.templateLanguage,
      );
    }

    const token = decryptToken(waba.accessTokenEncrypted);

    const metaBody = this.buildMetaPayload(conversation.contactPhone, input);

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
      body: input.type === 'text' ? input.text : null,
      templateName: input.type === 'template' ? input.templateName : null,
      timestamp: new Date(),
      metaMessageId,
    });
    await this.messages.save(message);

    conversation.lastMessageBody =
      message.body ?? `[Template: ${message.templateName}]`;
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
  ): MetaSendMessageInput {
    const phone = to.replace(/^\+/, '');
    if (input.type === 'text') {
      return { to: phone, type: 'text', text: { body: input.text } };
    }
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
        ?.details as { code?: number; error_subcode?: number } | undefined;
      const subcode = details?.error_subcode;
      const code = details?.code;

      if (code === 368 || subcode === 2388093) {
        throw new AppException(
          {
            code: WA_ERR.META_PAYMENT_REQUIRED,
            message:
              'Meta payment method not configured on WABA. Add a card in WhatsApp Manager.',
          },
          402,
        );
      }
      if (subcode === 2388094 || subcode === 2388095) {
        throw new AppException(
          {
            code: WA_ERR.META_BILLING_ERROR,
            message: 'Meta billing error — payment declined.',
          },
          402,
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
    };
  }
}
