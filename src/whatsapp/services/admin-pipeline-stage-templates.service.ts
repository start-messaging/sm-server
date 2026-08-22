import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaPipelineStageTemplate } from '../entities/wa-pipeline-stage-template.entity';
import type { CreatePipelineStageTemplateDto } from '../dto/create-pipeline-stage-template.dto';
import type { UpdatePipelineStageTemplateDto } from '../dto/update-pipeline-stage-template.dto';

@Injectable()
export class AdminPipelineStageTemplatesService {
  constructor(
    @InjectRepository(WaPipelineStageTemplate)
    private readonly templates: Repository<WaPipelineStageTemplate>,
  ) {}

  async list() {
    const rows = await this.templates.find({
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    return { pipelineStageTemplates: rows };
  }

  async create(dto: CreatePipelineStageTemplateDto) {
    const template = this.templates.create({
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? 'draft',
    });
    return this.templates.save(template);
  }

  async update(id: string, dto: UpdatePipelineStageTemplateDto) {
    const template = await this.templates.findOne({ where: { id } });
    if (!template)
      throw new NotFoundException('Pipeline stage template not found');
    if (dto.name !== undefined) template.name = dto.name;
    if (dto.sortOrder !== undefined) template.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) template.status = dto.status;
    return this.templates.save(template);
  }

  async remove(id: string): Promise<void> {
    const template = await this.templates.findOne({ where: { id } });
    if (!template)
      throw new NotFoundException('Pipeline stage template not found');
    await this.templates.softDelete(id);
  }
}
