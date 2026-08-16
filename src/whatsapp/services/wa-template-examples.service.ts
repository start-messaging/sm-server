import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { paginate } from '../../common/types/pagination';
import { DEFAULT_TEMPLATE_EXAMPLES } from '../data/default-template-examples';
import { CreateTemplateExampleDto } from '../dto/create-template-example.dto';
import { ListTemplateExamplesQueryDto } from '../dto/list-template-examples-query.dto';
import { UpdateTemplateExampleDto } from '../dto/update-template-example.dto';
import { WaTemplateExample } from '../entities/wa-template-example.entity';

@Injectable()
export class WaTemplateExamplesService implements OnModuleInit {
  private readonly logger = new Logger(WaTemplateExamplesService.name);

  constructor(
    @InjectRepository(WaTemplateExample)
    private readonly repo: Repository<WaTemplateExample>,
  ) {}

  async onModuleInit() {
    try {
      const inserted = await this.ensureDefaultExamples();
      if (inserted > 0) {
        this.logger.log(`Seeded ${inserted} default template example(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `Template example seed skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  /**
   * Insert missing gallery recipes by slug. Never updates existing rows
   * (admin edits stay intact).
   */
  async ensureDefaultExamples(): Promise<number> {
    let inserted = 0;
    for (const seed of DEFAULT_TEMPLATE_EXAMPLES) {
      const existing = await this.repo.findOne({
        where: { slug: seed.slug },
        withDeleted: true,
      });
      if (existing) continue;

      await this.repo.save(this.repo.create(seed));
      inserted += 1;
    }
    return inserted;
  }

  /**
   * Admin: list all examples (including drafts), paginated as `{ items, meta }`.
   */
  async listAll(query: ListTemplateExamplesQueryDto) {
    const [items, total] = await this.repo.findAndCount({
      where: query.status ? { status: query.status } : undefined,
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
      skip: query.skip,
      take: query.take,
    });
    return paginate(items, total, query);
  }

  /**
   * Client: published examples only, ordered by sortOrder.
   */
  async listPublished() {
    return this.repo.find({
      where: { status: 'published' },
      order: { sortOrder: 'ASC', createdAt: 'DESC' },
    });
  }

  /**
   * Admin: create a new template example.
   */
  async create(dto: CreateTemplateExampleDto) {
    const existing = await this.repo.findOne({ where: { slug: dto.slug } });
    if (existing) {
      throw new AppException(
        {
          code: 'TEMPLATE_EXAMPLE_SLUG_TAKEN',
          message: `Slug "${dto.slug}" already exists`,
        },
        409,
      );
    }

    const entity = this.repo.create({
      slug: dto.slug,
      suggestedName: dto.suggestedName,
      category: dto.category,
      language: dto.language,
      components: dto.components,
      useWhen: dto.useWhen ?? '',
      metaTip: dto.metaTip ?? '',
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? 'draft',
    });

    return this.repo.save(entity);
  }

  /**
   * Admin: update an existing template example.
   */
  async update(id: string, dto: UpdateTemplateExampleDto) {
    const example = await this.findOrFail(id);

    if (dto.slug && dto.slug !== example.slug) {
      const slugTaken = await this.repo.findOne({
        where: { slug: dto.slug, id: Not(id) },
      });
      if (slugTaken) {
        throw new AppException(
          {
            code: 'TEMPLATE_EXAMPLE_SLUG_TAKEN',
            message: `Slug "${dto.slug}" already exists`,
          },
          409,
        );
      }
    }

    Object.assign(example, dto);
    return this.repo.save(example);
  }

  /**
   * Admin: soft-delete a template example.
   */
  async remove(id: string) {
    const example = await this.findOrFail(id);
    await this.repo.softRemove(example);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async findOrFail(id: string): Promise<WaTemplateExample> {
    const example = await this.repo.findOne({ where: { id } });
    if (!example) {
      throw new AppException(
        {
          code: 'TEMPLATE_EXAMPLE_NOT_FOUND',
          message: 'Template example not found',
        },
        404,
      );
    }
    return example;
  }
}

