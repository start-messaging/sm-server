import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import { PLAN_FEATURE_KEYS } from '../../plans/plan-keys';
import { RedisService } from '../../redis/redis.service';
import {
  Workspace,
  WorkspaceStatus,
} from '../../workspaces/entities/workspace.entity';
import { PlanLimitService } from '../../workspaces/plan-limit.service';
import { TriggerSendDto } from '../dto/trigger-send.dto';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { ContactOptedOutException } from '../exceptions/contact-opted-out.exception';
import { ApiKeyGuard } from '../guards/api-key.guard';
import type { ApiKeyScopedRequest } from '../guards/api-key.guard';
import { WhatsappSendService } from '../services/whatsapp-send.service';
import { WA_ERR } from '../whatsapp-error-codes';

const RATE_WINDOW_SECONDS = 3600;

/**
 * Public outbound trigger API — authenticated by workspace API key, not JWT.
 *
 * VERSION_NEUTRAL opts this controller out of the global URI versioning
 * (`/v1/...`) that every internal route gets, so the path is literally
 * `/api/v1/trigger/send`. The `v1` here belongs to the customer-facing API
 * contract and is versioned independently of the internal one.
 */
@ApiExcludeController()
@Controller({ path: 'api/v1/trigger', version: VERSION_NEUTRAL })
@UseGuards(ApiKeyGuard)
export class WhatsappTriggerController {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WaTemplate)
    private readonly templates: Repository<WaTemplate>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    private readonly redis: RedisService,
    private readonly planLimits: PlanLimitService,
    private readonly sendService: WhatsappSendService,
  ) {}

  @Post('send')
  async send(
    @Req() req: ApiKeyScopedRequest,
    @Body() dto: TriggerSendDto,
  ): Promise<{ messageId: string; status: 'queued' }> {
    const workspaceId = req.apiKeyWorkspaceId;
    const workspace = await this.requireWorkspace(workspaceId);
    const plan = workspace.plan;

    // Re-checked per send, not just at key creation: a workspace that
    // downgrades must stop being able to use keys it already issued.
    if (!plan?.features?.[PLAN_FEATURE_KEYS.apiTriggers]) {
      throw new AppException(
        {
          code: WA_ERR.PLAN_FEATURE_REQUIRED,
          message:
            'Your CRM plan does not include the trigger API. Please upgrade.',
          details: {
            feature: PLAN_FEATURE_KEYS.apiTriggers,
            currentPlan: plan?.code ?? null,
          },
        },
        403,
      );
    }

    await this.assertUnderRateLimit(workspaceId, hourlyLimitFor(plan.tier));

    await this.requireApprovedTemplate(
      workspaceId,
      dto.templateName,
      dto.templateLanguage,
    );

    const { e164 } = parseMobileOrThrow(dto.to);
    const contact = await this.upsertContact(workspaceId, e164, plan);
    if (!contact.optedIn) throw new ContactOptedOutException();

    const conversation = await this.ensureConversation(workspaceId, contact);

    const message = await this.sendService.send(workspaceId, conversation.id, {
      type: 'template',
      templateName: dto.templateName,
      templateLanguage: dto.templateLanguage,
      ...(dto.parameters?.length ? { parameters: dto.parameters } : {}),
    });

    return { messageId: message.id, status: 'queued' };
  }

  /**
   * Fixed-window counter, one bucket per workspace per wall-clock hour. The
   * TTL is set on the bucket's first hit so an abandoned workspace leaves
   * nothing behind; a stale key without a TTL would pin the count forever, so
   * EXPIRE is re-issued defensively.
   */
  private async assertUnderRateLimit(
    workspaceId: string,
    limit: number,
  ): Promise<void> {
    const hourEpoch = Math.floor(Date.now() / (RATE_WINDOW_SECONDS * 1000));
    const key = `trigger:rate:${workspaceId}:${hourEpoch}`;
    const count = await this.redis.raw.incr(key);
    if (count === 1) await this.redis.expire(key, RATE_WINDOW_SECONDS);

    if (count > limit) {
      throw new AppException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Trigger API rate limit reached: ${limit} request(s) per hour on this plan.`,
          details: { limit, windowSeconds: RATE_WINDOW_SECONDS },
        },
        429,
      );
    }
  }

  private async requireWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId, status: WorkspaceStatus.ACTIVE },
      relations: { plan: true },
    });
    if (!workspace) {
      throw new AppException(
        {
          code: 'WORKSPACE_NOT_FOUND',
          message: 'The workspace for this API key is no longer active',
        },
        404,
      );
    }
    return workspace;
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
          message: `Template "${name}" (${language}) was not found in this workspace.`,
        },
        404,
      );
    }
    if (template.status !== 'APPROVED') {
      throw new AppException(
        {
          code: 'TEMPLATE_NOT_APPROVED',
          message: `Template "${name}" is ${template.status}. Only APPROVED templates can be sent.`,
          details: { status: template.status },
        },
        422,
      );
    }
    return template;
  }

  /**
   * Triggers routinely address people who are not in the contact book yet, so
   * a missing contact is created rather than rejected — but it still counts
   * against `max_contacts` like any other create path.
   */
  private async upsertContact(
    workspaceId: string,
    e164: string,
    plan: Workspace['plan'],
  ): Promise<WaContact> {
    const existing = await this.contacts.findOne({
      where: { workspaceId, phoneE164: e164 },
    });
    if (existing) return existing;

    if (plan) await this.planLimits.assertCanAddContact(plan, workspaceId);

    const contact = this.contacts.create({
      workspaceId,
      name: null,
      phoneE164: e164,
      email: null,
      tags: [],
      optedIn: true,
      source: 'manual',
      attributes: {},
    });
    return this.contacts.save(contact);
  }

  /** Mirrors the campaign worker: legacy rows may store the number unprefixed. */
  private async ensureConversation(
    workspaceId: string,
    contact: WaContact,
  ): Promise<WaConversation> {
    const digits = contact.phoneE164.replace(/^\+/, '');
    let conversation = await this.conversations.findOne({
      where: { workspaceId, contactPhone: contact.phoneE164 },
    });
    if (!conversation && digits !== contact.phoneE164) {
      conversation = await this.conversations.findOne({
        where: { workspaceId, contactPhone: digits },
      });
      if (conversation) conversation.contactPhone = contact.phoneE164;
    }

    if (!conversation) {
      conversation = this.conversations.create({
        workspaceId,
        contactId: contact.id,
        contactPhone: contact.phoneE164,
        contactName: contact.name,
        unreadCount: 0,
      });
    } else if (!conversation.contactId) {
      conversation.contactId = contact.id;
    }

    return this.conversations.save(conversation);
  }
}

/**
 * Hourly trigger budget. Keyed off the plan tier rather than the code so a
 * plan added later is never throttled harder than a lower tier:
 * FREE (0) = 10, BASIC (1) = 500, ADVANCED (2) and above = 5000.
 */
function hourlyLimitFor(tier: number): number {
  if (tier >= 2) return 5000;
  if (tier >= 1) return 500;
  return 10;
}
