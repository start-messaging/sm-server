import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type PipelineStageTemplateStatus = 'draft' | 'published';

/**
 * Global pipeline stage templates (not workspace-scoped). Published rows
 * are copied into a workspace's `wa_pipeline_stages` on first use.
 */
@Entity({ name: 'wa_pipeline_stage_templates' })
export class WaPipelineStageTemplate extends BaseEntity {
  @Column({ type: 'varchar', length: 60 })
  name!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status!: PipelineStageTemplateStatus;
}
