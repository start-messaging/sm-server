import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import {
  WaTemplate,
  TemplateComponent,
  TemplateCategory,
} from '../entities/wa-template.entity';
import { WA_ERR } from '../whatsapp-error-codes';
import { MetaGraphClient, type MetaTemplate } from './meta-graph.client';
import { parseTemplateCategory } from '../utils/template-category';

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
    return { templates: templates.map(this.serialize), total };
  }

  async create(
    workspaceId: string,
    dto: {
      name: string;
      language: string;
      category: TemplateCategory;
      components: TemplateComponent[];
    },
  ) {
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);

    // Meta rejects (INVALID_FORMAT) variable templates without sample values.
    const components = attachVariableExamples(dto.components);

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
    });
    await this.templates.save(template);
    return this.serialize(template);
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

      if (existing) {
        applyMetaCategory(existing, mt);
        existing.status = mt.status as WaTemplate['status'];
        existing.metaTemplateId = mt.id;
        existing.components = (mt.components ?? []) as TemplateComponent[];
        existing.rejectionReason = mt.rejected_reason ?? null;
        await this.templates.save(existing);
      } else {
        const t = this.templates.create({
          workspaceId,
          wabaAccountId: waba.id,
          name: mt.name,
          language: mt.language,
          category: parseTemplateCategory(mt.category) ?? 'UTILITY',
          submittedCategory: parseTemplateCategory(mt.category),
          correctCategory: pendingCorrectCategory(mt),
          status: mt.status as WaTemplate['status'],
          components: (mt.components ?? []) as TemplateComponent[],
          metaTemplateId: mt.id,
          rejectionReason: mt.rejected_reason ?? null,
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
    return { templates: templates.map(this.serialize), total };
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

  private serialize(t: WaTemplate) {
    return {
      id: t.id,
      name: t.name,
      language: t.language,
      category: t.category,
      submittedCategory: t.submittedCategory,
      correctCategory: t.correctCategory,
      status: t.status,
      components: t.components,
      rejectionReason: t.rejectionReason,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}

const POSITIONAL_VAR_RE = /\{\{(\d+)\}\}/g;

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
