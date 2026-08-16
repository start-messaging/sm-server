import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import type { TemplateCategory, TemplateComponent } from './wa-template.entity';

export type TemplateExampleStatus = 'draft' | 'published';

/**
 * Admin-curated gallery of Meta-compliant starter recipes.
 * Global (not per-workspace) — published examples are served to all clients.
 */
@Index('uq_wa_template_examples_slug', ['slug'], {
  unique: true,
  where: '"deleted_at" IS NULL',
})
@Entity({ name: 'wa_template_examples' })
export class WaTemplateExample extends BaseEntity {
  @Column({ type: 'varchar', length: 100 })
  slug!: string;

  @Column({ name: 'suggested_name', type: 'varchar', length: 512 })
  suggestedName!: string;

  @Column({ type: 'varchar', length: 20 })
  category!: TemplateCategory;

  @Column({ type: 'varchar', length: 10, default: 'en_US' })
  language!: string;

  @Column({ type: 'jsonb', default: '[]' })
  components!: TemplateComponent[];

  @Column({ name: 'use_when', type: 'text', default: '' })
  useWhen!: string;

  @Column({ name: 'meta_tip', type: 'text', default: '' })
  metaTip!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'varchar', length: 12, default: 'draft' })
  status!: TemplateExampleStatus;
}
