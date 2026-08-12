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
import { MetaGraphClient } from './meta-graph.client';

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

    const result = await this.meta.createTemplate(
      waba.metaWabaId,
      {
        name: dto.name,
        language: dto.language,
        category: dto.category,
        components: dto.components,
      },
      token,
    );

    const template = this.templates.create({
      workspaceId,
      wabaAccountId: waba.id,
      name: dto.name,
      language: dto.language,
      category: dto.category,
      status: 'PENDING',
      components: dto.components,
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

    await this.meta.deleteTemplate(waba.metaWabaId, template.name, token);
    await this.templates.softRemove(template);
  }

  async sync(workspaceId: string) {
    const waba = await this.requireWaba(workspaceId);
    const token = decryptToken(waba.accessTokenEncrypted);

    const metaTemplates = await this.meta.getTemplates(waba.metaWabaId, token);

    for (const mt of metaTemplates) {
      const existing = await this.templates.findOne({
        where: { wabaAccountId: waba.id, name: mt.name, language: mt.language },
      });

      if (existing) {
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
          category: mt.category as TemplateCategory,
          status: mt.status as WaTemplate['status'],
          components: (mt.components ?? []) as TemplateComponent[],
          metaTemplateId: mt.id,
          rejectionReason: mt.rejected_reason ?? null,
        });
        await this.templates.save(t);
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
      status: t.status,
      components: t.components,
      rejectionReason: t.rejectionReason,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
