import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  WaTemplate,
  TemplateComponent,
  TemplateCarouselCard,
  TemplateButton,
  TemplateCategory,
  TemplateSubtype,
} from '../entities/wa-template.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { MetaGraphClient, type MetaTemplate } from './meta-graph.client';
import { parseTemplateCategory } from '../utils/template-category';
import {
  collectTemplateButtons,
  findTemplateShapeViolation,
  resolveTemplateSubtype,
} from '../dto/create-template.dto';
import type {
  CreateTemplateDto,
  TemplateButtonDto,
  TemplateComponentDto,
} from '../dto/create-template.dto';
import { toWaTemplateDto } from '../dto/wa-template.dto';

@Injectable()
export class WhatsappTemplatesService {
  private readonly logger = new Logger(WhatsappTemplatesService.name);

  constructor(
    private readonly meta: MetaGraphClient,
    @InjectRepository(WaTemplate)
    private readonly templates: Repository<WaTemplate>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
  ) {}

  async list(workspaceId: string) {
    const [templates, total] = await this.templates.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { templates: templates.map(toWaTemplateDto), total };
  }

  async create(workspaceId: string, dto: CreateTemplateDto) {
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);

    // The ValidationPipe already ran this via @ValidTemplateShape(). Repeated
    // here so no internal caller can reach the Graph API with a mix Meta will
    // reject (and burn the template name, which Meta will not free up).
    const violation = findTemplateShapeViolation(dto);
    if (violation) {
      throw new AppException(
        { code: TEMPLATE_INVALID_BUTTONS, message: violation },
        400,
      );
    }

    const subtype = resolveTemplateSubtype(dto);
    const buttons = normalizeTemplateButtons(
      collectTemplateButtons(dto),
      subtype,
    );
    const cards = buildCarouselCards(dto);
    const components = buildTemplateComponents(dto, subtype, buttons, cards);

    const result = await this.meta.createTemplate(
      waba.metaWabaId,
      {
        name: dto.name,
        language: dto.language,
        category: dto.category,
        components,
      },
      token,
    );

    // Meta approval is asynchronous — the row starts PENDING and only the
    // status webhook / sync may promote it to APPROVED.
    const template = this.templates.create({
      workspaceId,
      wabaAccountId: waba.id,
      name: dto.name,
      language: dto.language,
      category: dto.category,
      submittedCategory: dto.category,
      correctCategory: null,
      status: 'PENDING',
      components,
      metaTemplateId: result.id,
      rejectionReason: null,
      hasButtons: buttons.length > 0,
      buttons: buttons.length > 0 ? buttons : null,
      templateSubtype: subtype,
      isCarousel: subtype === 'carousel',
      carouselCardCount: cards?.length ?? null,
    });
    await this.templates.save(template);
    return toWaTemplateDto(template);
  }

  async delete(workspaceId: string, templateId: string): Promise<void> {
    const template = await this.templates.findOne({
      where: { id: templateId, workspaceId },
    });
    if (!template) {
      throw new AppException(
        { code: WA_ERR.TEMPLATE_NOT_FOUND, message: 'Template not found' },
        404,
      );
    }
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);

    try {
      await this.meta.deleteTemplate(waba.metaWabaId, template.name, token);
    } catch (err) {
      // Already deleted in WhatsApp Manager — still clear our row.
      if (!isMetaTemplateMissing(err)) throw err;
      this.logger.warn(
        `Meta template "${template.name}" already missing; removing local row ${template.id}`,
      );
    }
    await this.templates.softRemove(template);
  }

  async sync(workspaceId: string) {
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);

    const metaTemplates = await this.meta.getTemplates(waba.metaWabaId, token);
    const seenKeys = new Set(
      metaTemplates.map((mt) => `${mt.name}::${mt.language}`),
    );

    for (const mt of metaTemplates) {
      const existing = await this.templates.findOne({
        where: { wabaAccountId: waba.id, name: mt.name, language: mt.language },
      });

      const components = (mt.components ?? []) as TemplateComponent[];

      if (existing) {
        applyMetaCategory(existing, mt);
        existing.status = mt.status as WaTemplate['status'];
        existing.metaTemplateId = mt.id;
        existing.components = components;
        existing.rejectionReason = mt.rejected_reason ?? null;
        // Re-derived, not preserved: the template may have been edited in
        // WhatsApp Manager since we last saw it.
        applyTemplateShape(existing, components);
        await this.templates.save(existing);
      } else {
        const category = parseTemplateCategory(mt.category) ?? 'UTILITY';
        const t = this.templates.create({
          workspaceId,
          wabaAccountId: waba.id,
          name: mt.name,
          language: mt.language,
          category,
          submittedCategory: parseTemplateCategory(mt.category),
          correctCategory: pendingCorrectCategory(mt),
          status: mt.status as WaTemplate['status'],
          components,
          metaTemplateId: mt.id,
          rejectionReason: mt.rejected_reason ?? null,
          ...deriveTemplateShape(components, category),
        });
        await this.templates.save(t);
      }
    }

    // Drop local rows Meta no longer returns (deleted in Manager, etc.).
    const locals = await this.templates.find({
      where: { workspaceId, wabaAccountId: waba.id },
    });
    for (const local of locals) {
      if (!seenKeys.has(`${local.name}::${local.language}`)) {
        await this.templates.softRemove(local);
      }
    }

    const [templates, total] = await this.templates.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { templates: templates.map(toWaTemplateDto), total };
  }

  async uploadTemplateMedia(
    workspaceId: string,
    buffer: Buffer,
    mimeType: string,
    fileLength: number,
  ): Promise<{ handle: string }> {
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);
    const handle = await this.meta.resumableUploadTemplateMedia(
      waba.metaWabaId,
      token,
      buffer,
      mimeType,
      fileLength,
    );
    return { handle };
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
}

const POSITIONAL_VAR_RE = /\{\{(\d+)\}\}/g;

/** Not in WA_ERR yet — kept as a literal so the client catalog can adopt it. */
const TEMPLATE_INVALID_BUTTONS = 'TEMPLATE_INVALID_BUTTONS';

function pendingCorrectCategory(mt: MetaTemplate): TemplateCategory | null {
  const current = parseTemplateCategory(mt.category);
  const correct = parseTemplateCategory(mt.correct_category);
  if (!current || !correct || current === correct) return null;
  return correct;
}

function applyMetaCategory(existing: WaTemplate, mt: MetaTemplate): void {
  if (!existing.submittedCategory) {
    existing.submittedCategory = existing.category;
  }
  const current = parseTemplateCategory(mt.category);
  if (current) existing.category = current;
  existing.correctCategory = pendingCorrectCategory(mt);
}

/** Meta subcode when deleting a template that is already gone. */
const META_TEMPLATE_MISSING_SUBCODE = 2593002;

function isMetaTemplateMissing(err: unknown): boolean {
  if (!(err instanceof AppException)) return false;
  const details = err.getResponse();
  const payload =
    typeof details === 'object' && details !== null
      ? (details as {
          details?: {
            error_subcode?: number;
            message?: string;
            error_user_msg?: string;
          };
          message?: string;
        })
      : null;
  const meta = payload?.details;
  if (meta?.error_subcode === META_TEMPLATE_MISSING_SUBCODE) return true;
  const msg = (
    meta?.error_user_msg ??
    meta?.message ??
    payload?.message ??
    ''
  ).toLowerCase();
  return (
    msg.includes('does not exist') ||
    msg.includes('template name does not exist') ||
    msg.includes('no template exists')
  );
}

/**
 * Assemble the Graph `components` array. Buttons are always re-emitted as a
 * single trailing BUTTONS component from the normalized list, so it does not
 * matter whether the caller sent them top-level or nested in `components`.
 * LTO and carousel templates cannot carry a FOOTER, so one is dropped rather
 * than handed to Meta for a guaranteed rejection.
 */
export function buildTemplateComponents(
  dto: CreateTemplateDto,
  subtype: TemplateSubtype,
  buttons: TemplateButton[],
  cards: TemplateCarouselCard[] | null,
): TemplateComponent[] {
  const footerAllowed = subtype !== 'lto' && subtype !== 'carousel';
  const base = attachVariableExamples(
    dto.components
      .filter((c) => c.type !== 'BUTTONS')
      .filter((c) => footerAllowed || c.type !== 'FOOTER')
      .map(toTemplateComponent),
  );

  const out = [...base];
  if (buttons.length > 0) out.push({ type: 'BUTTONS', buttons });
  if (cards) out.push({ type: 'CAROUSEL', cards });
  return out;
}

/** Explicit field pick — `buttons` is deliberately dropped (re-emitted later). */
function toTemplateComponent(c: TemplateComponentDto): TemplateComponent {
  const out: TemplateComponent = { type: c.type };
  if (c.text !== undefined) out.text = c.text;
  if (c.format !== undefined) out.format = c.format;
  if (c.link !== undefined) out.link = c.link;
  if (c.example !== undefined) out.example = c.example;
  if (c.limited_time_offer !== undefined) {
    out.limited_time_offer = {
      text: c.limited_time_offer.text,
      has_expiration: c.limited_time_offer.has_expiration ?? false,
    };
  }
  if (c.add_security_recommendation !== undefined) {
    out.add_security_recommendation = c.add_security_recommendation;
  }
  if (c.code_expiration_minutes !== undefined) {
    out.code_expiration_minutes = c.code_expiration_minutes;
  }
  return out;
}

/**
 * Carousel cards are their own component trees. Card count is frozen here —
 * Meta approves the shape, so an approved 3-card carousel can only ever send
 * exactly 3 cards.
 */
export function buildCarouselCards(
  dto: CreateTemplateDto,
): TemplateCarouselCard[] | null {
  const cards = dto.carouselCards ?? [];
  if (cards.length === 0) return null;

  const format = dto.carouselHeaderFormat ?? 'IMAGE';
  return cards.map((card) => {
    const components: TemplateComponent[] = [];
    if (card.headerMediaHandle) {
      components.push({
        type: 'HEADER',
        format,
        example: { header_handle: [card.headerMediaHandle] },
      });
    }
    if (card.bodyText) {
      components.push(
        ...attachVariableExamples([{ type: 'BODY', text: card.bodyText }]),
      );
    }
    components.push({
      type: 'BUTTONS',
      buttons: card.buttons.map(normalizeTemplateButton),
    });
    return { components };
  });
}

/**
 * Meta rules honoured here (template components docs):
 * - URL `example` is the {{1}} suffix (`summer2023`), not the full URL
 * - PHONE_NUMBER is digits (Meta example: `15550051310`)
 * - LTO requires COPY_CODE at index 0 and URL at index 1
 * - COPY_CODE / REQUEST_CONTACT_INFO carry no label; Meta fixes those
 *
 * Order is otherwise preserved — a quick-reply/CTA interleave is rejected by
 * `findTemplateShapeViolation` rather than silently reshuffled.
 */
export function normalizeTemplateButtons(
  raw: TemplateButtonDto[],
  subtype: TemplateSubtype,
): TemplateButton[] {
  if (raw.length === 0) return [];
  const ordered = subtype === 'lto' ? sortLtoButtons(raw) : raw;
  return ordered.map(normalizeTemplateButton);
}

function sortLtoButtons(raw: TemplateButtonDto[]): TemplateButtonDto[] {
  const rank = (b: TemplateButtonDto) =>
    b.type === 'COPY_CODE' ? 0 : b.type === 'URL' ? 1 : 2;
  return [...raw].sort((a, b) => rank(a) - rank(b));
}

function normalizeTemplateButton(b: TemplateButtonDto): TemplateButton {
  switch (b.type) {
    case 'QUICK_REPLY':
      return { type: 'QUICK_REPLY', text: b.text };
    case 'PHONE_NUMBER': {
      const digits = (b.phone_number ?? b.phoneNumber ?? '').replace(/\D/g, '');
      return { type: 'PHONE_NUMBER', text: b.text, phone_number: digits };
    }
    case 'COPY_CODE': {
      const sample = b.example?.[0];
      return sample
        ? { type: 'COPY_CODE', example: sample }
        : { type: 'COPY_CODE' };
    }
    case 'REQUEST_CONTACT_INFO':
      return { type: 'REQUEST_CONTACT_INFO' };
    case 'OTP':
      return normalizeOtpButton(b);
    default: {
      const url = b.url ?? '';
      const example = normalizeUrlButtonExample(url, b.example);
      return example
        ? { type: 'URL', text: b.text, url, example }
        : { type: 'URL', text: b.text, url };
    }
  }
}

/** ONE_TAP / ZERO_TAP autofill needs the app identity; COPY_CODE does not. */
function normalizeOtpButton(b: TemplateButtonDto): TemplateButton {
  const otpType = b.otp_type ?? 'COPY_CODE';
  const button: TemplateButton = { type: 'OTP', otp_type: otpType };
  if (b.text) button.text = b.text;
  if (otpType === 'COPY_CODE') return button;

  if (b.autofill_text) button.autofill_text = b.autofill_text;
  if (b.package_name && b.signature_hash) {
    button.supported_apps = [
      { package_name: b.package_name, signature_hash: b.signature_hash },
    ];
  }
  return button;
}

/**
 * Re-derive the denormalised advanced-template columns from a components
 * array. Used on sync so a template edited (or authored) in WhatsApp Manager
 * still lands with the right subtype and buttons on our side.
 */
export function deriveTemplateShape(
  components: TemplateComponent[],
  category: TemplateCategory,
): Pick<
  WaTemplate,
  | 'hasButtons'
  | 'buttons'
  | 'templateSubtype'
  | 'isCarousel'
  | 'carouselCardCount'
> {
  const carousel = components.find((c) => c.type === 'CAROUSEL');
  const buttons = components.find((c) => c.type === 'BUTTONS')?.buttons ?? [];

  return {
    hasButtons: buttons.length > 0,
    buttons: buttons.length > 0 ? buttons : null,
    templateSubtype: deriveTemplateSubtype(
      components,
      buttons,
      category,
      carousel != null,
    ),
    isCarousel: carousel != null,
    carouselCardCount: carousel ? (carousel.cards?.length ?? 0) : null,
  };
}

function deriveTemplateSubtype(
  components: TemplateComponent[],
  buttons: TemplateButton[],
  category: TemplateCategory,
  isCarousel: boolean,
): TemplateSubtype {
  if (isCarousel) return 'carousel';
  if (components.some((c) => c.type === 'LIMITED_TIME_OFFER')) return 'lto';
  if (category === 'AUTHENTICATION' || buttons.some((b) => b.type === 'OTP')) {
    return 'authentication';
  }
  return 'standard';
}

function applyTemplateShape(
  target: WaTemplate,
  components: TemplateComponent[],
): void {
  const shape = deriveTemplateShape(components, target.category);
  target.hasButtons = shape.hasButtons;
  target.buttons = shape.buttons;
  target.templateSubtype = shape.templateSubtype;
  target.isCarousel = shape.isCarousel;
  target.carouselCardCount = shape.carouselCardCount;
}

/** Meta example: url `…promo={{1}}` → example `["summer2023"]`. */
function normalizeUrlButtonExample(
  url: string,
  example?: string[],
): string[] | undefined {
  if (!/\{\{1\}\}/.test(url) || !example?.[0]) return undefined;
  const sample = example[0];
  const prefix = url.split('{{1}}')[0] ?? '';
  if (prefix && sample.startsWith(prefix)) {
    return [sample.slice(prefix.length)];
  }
  return [sample];
}

/**
 * Meta requires an `example` object for every HEADER/BODY that contains {{n}}.
 * Without it, review returns REJECTED / INVALID_FORMAT.
 */
export function attachVariableExamples(
  components: TemplateComponent[],
): TemplateComponent[] {
  return components.map((c) => {
    if ((c.type !== 'BODY' && c.type !== 'HEADER') || !c.text) return c;
    if (c.example) return c;

    const indexes = [
      ...new Set(
        [...c.text.matchAll(POSITIONAL_VAR_RE)].map((m) => Number(m[1])),
      ),
    ].sort((a, b) => a - b);
    if (indexes.length === 0) return c;

    const samples = indexes.map((n) => `example_${n}`);
    if (c.type === 'BODY') {
      return { ...c, example: { body_text: [samples] } };
    }
    return {
      ...c,
      format: c.format ?? 'TEXT',
      example: { header_text: samples },
    };
  });
}
