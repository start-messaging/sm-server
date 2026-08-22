import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WaPipelineStage } from '../entities/wa-pipeline-stage.entity';
import { WaPipelineStageTemplate } from '../entities/wa-pipeline-stage-template.entity';

const DEFAULT_STAGE_NAMES = [
  'Prospecting',
  'In progress',
  'Closed won',
  'Closed lost',
];

@Injectable()
export class WhatsappPipelineStagesService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappPipelineStagesService.name);

  constructor(
    @InjectRepository(WaPipelineStage)
    private readonly stages: Repository<WaPipelineStage>,
    @InjectRepository(WaPipelineStageTemplate)
    private readonly templates: Repository<WaPipelineStageTemplate>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedGlobalTemplatesIfEmpty();
  }

  async list(workspaceId: string) {
    let rows = await this.stages.find({
      where: { workspaceId },
      order: { sortOrder: 'ASC' },
    });

    if (rows.length === 0) {
      rows = await this.seedWorkspaceStages(workspaceId);
    }

    return {
      pipelineStages: rows.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        isDefault: s.isDefault,
      })),
    };
  }

  /**
   * Seed default pipeline stages for a workspace. Prefer published
   * templates; fall back to hardcoded names.
   */
  private async seedWorkspaceStages(
    workspaceId: string,
  ): Promise<WaPipelineStage[]> {
    const published = await this.templates.find({
      where: { status: 'published' },
      order: { sortOrder: 'ASC' },
    });

    const names =
      published.length > 0 ? published.map((t) => t.name) : DEFAULT_STAGE_NAMES;

    const stages: WaPipelineStage[] = [];
    for (let i = 0; i < names.length; i++) {
      const stage = this.stages.create({
        workspaceId,
        name: names[i]!,
        sortOrder: i,
        isDefault: i === 0,
      });
      stages.push(stage);
    }
    await this.stages.save(stages);
    return stages;
  }

  /**
   * Seed global pipeline stage templates if empty. Called on module init
   * so fresh DBs have published rows for workspace-copy-on-first-use.
   */
  async seedGlobalTemplatesIfEmpty(): Promise<void> {
    const count = await this.templates.count();
    if (count > 0) return;
    const rows = DEFAULT_STAGE_NAMES.map((name, i) =>
      this.templates.create({
        name,
        sortOrder: i,
        status: 'published',
      }),
    );
    await this.templates.save(rows);
    this.logger.log(`Seeded ${rows.length} global pipeline stage templates`);
  }
}
