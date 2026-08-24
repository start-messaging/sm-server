import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { selectMatchingRule } from './auto-reply-match';
import {
  WaAutoReplyRule,
  type AutoReplyMatchType,
  type AutoReplyType,
} from './wa-auto-reply-rule.entity';

export interface AutoReplyRuleInput {
  name: string;
  keywords: string[];
  matchType: AutoReplyMatchType;
  replyType: AutoReplyType;
  replyText?: string;
  replyTemplateName?: string;
  replyTemplateLanguage?: string;
  isActive?: boolean;
  priority?: number;
}

@Injectable()
export class WhatsappAutoRepliesService {
  constructor(
    @InjectRepository(WaAutoReplyRule)
    private readonly rules: Repository<WaAutoReplyRule>,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.rules.find({
      where: { workspaceId },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    return { rules: rows.map((r) => this.serialize(r)) };
  }

  async create(workspaceId: string, input: AutoReplyRuleInput) {
    const keywords = this.normalizeKeywords(input.keywords);
    this.assertReplyPayload(
      input.replyType,
      input.replyText,
      input.replyTemplateName,
      input.replyTemplateLanguage,
    );

    const rule = this.rules.create({
      workspaceId,
      name: input.name,
      keywords,
      matchType: input.matchType,
      replyType: input.replyType,
      replyText: input.replyType === 'text' ? (input.replyText ?? null) : null,
      replyTemplateName:
        input.replyType === 'template'
          ? (input.replyTemplateName ?? null)
          : null,
      replyTemplateLanguage:
        input.replyType === 'template'
          ? (input.replyTemplateLanguage ?? null)
          : null,
      isActive: input.isActive ?? true,
      priority: input.priority ?? 0,
    });
    await this.rules.save(rule);
    return this.serialize(rule);
  }

  async update(
    workspaceId: string,
    id: string,
    input: Partial<AutoReplyRuleInput>,
  ) {
    const rule = await this.requireRule(workspaceId, id);

    if (input.name !== undefined) rule.name = input.name;
    if (input.keywords !== undefined) {
      rule.keywords = this.normalizeKeywords(input.keywords);
    }
    if (input.matchType !== undefined) rule.matchType = input.matchType;
    if (input.isActive !== undefined) rule.isActive = input.isActive;
    if (input.priority !== undefined) rule.priority = input.priority;

    const replyType = input.replyType ?? rule.replyType;
    const replyText = input.replyText ?? rule.replyText ?? undefined;
    const replyTemplateName =
      input.replyTemplateName ?? rule.replyTemplateName ?? undefined;
    const replyTemplateLanguage =
      input.replyTemplateLanguage ?? rule.replyTemplateLanguage ?? undefined;

    this.assertReplyPayload(
      replyType,
      replyText,
      replyTemplateName,
      replyTemplateLanguage,
    );

    rule.replyType = replyType;
    rule.replyText = replyType === 'text' ? (replyText ?? null) : null;
    rule.replyTemplateName =
      replyType === 'template' ? (replyTemplateName ?? null) : null;
    rule.replyTemplateLanguage =
      replyType === 'template' ? (replyTemplateLanguage ?? null) : null;

    await this.rules.save(rule);
    return this.serialize(rule);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const rule = await this.requireRule(workspaceId, id);
    await this.rules.softRemove(rule);
  }

  /**
   * Highest-priority active rule whose keywords match the inbound text, or
   * null. Called from the inbound webhook worker — never throws on no match.
   */
  async findMatchingRule(
    workspaceId: string,
    inboundText: string | null,
  ): Promise<WaAutoReplyRule | null> {
    if (!inboundText?.trim()) return null;

    const active = await this.rules.find({
      where: { workspaceId, isActive: true },
      order: { priority: 'ASC', createdAt: 'ASC' },
    });
    return selectMatchingRule(active, inboundText);
  }

  private async requireRule(
    workspaceId: string,
    id: string,
  ): Promise<WaAutoReplyRule> {
    const rule = await this.rules.findOne({ where: { id, workspaceId } });
    if (!rule) {
      throw new AppException(
        {
          code: 'AUTO_REPLY_RULE_NOT_FOUND',
          message: 'Auto-reply rule not found',
        },
        404,
      );
    }
    return rule;
  }

  private normalizeKeywords(keywords: string[]): string[] {
    const cleaned = Array.from(
      new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 0)),
    );
    if (cleaned.length === 0) {
      throw new AppException(
        {
          code: 'AUTO_REPLY_RULE_INVALID',
          message: 'At least one non-empty keyword is required',
        },
        400,
      );
    }
    return cleaned;
  }

  private assertReplyPayload(
    replyType: AutoReplyType,
    replyText?: string,
    replyTemplateName?: string,
    replyTemplateLanguage?: string,
  ): void {
    if (replyType === 'text' && !replyText?.trim()) {
      throw new AppException(
        {
          code: 'AUTO_REPLY_RULE_INVALID',
          message: 'replyText is required when replyType is "text"',
        },
        400,
      );
    }
    if (
      replyType === 'template' &&
      (!replyTemplateName?.trim() || !replyTemplateLanguage?.trim())
    ) {
      throw new AppException(
        {
          code: 'AUTO_REPLY_RULE_INVALID',
          message:
            'replyTemplateName and replyTemplateLanguage are required when replyType is "template"',
        },
        400,
      );
    }
  }

  private serialize(rule: WaAutoReplyRule) {
    return {
      id: rule.id,
      name: rule.name,
      keywords: rule.keywords,
      matchType: rule.matchType,
      replyType: rule.replyType,
      replyText: rule.replyText,
      replyTemplateName: rule.replyTemplateName,
      replyTemplateLanguage: rule.replyTemplateLanguage,
      isActive: rule.isActive,
      priority: rule.priority,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }
}
