import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { presentCategory, type CategoryProfile } from './category-profile';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceCategory } from './entities/service-category.entity';
import { ServiceCountryRate } from './entities/service-country-rate.entity';
import { Service, ServiceStatus } from './entities/service.entity';
import { presentService, type ServiceProfile } from './service-profile';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(ServiceCategory)
    private readonly categories: Repository<ServiceCategory>,
    @InjectRepository(ServiceCountryRate)
    private readonly rates: Repository<ServiceCountryRate>,
    private readonly logger: AppLogger,
  ) {}

  /** Full catalogue with categories inlined (small fixed set — no pagination). */
  async list(): Promise<ServiceProfile[]> {
    const rows = await this.services.find({
      relations: { categories: true },
      order: { key: 'ASC' },
    });
    const counts = await this.pricedCountryCounts();
    return rows.map((s) => presentService(s, counts.get(s.key) ?? 0));
  }

  /** Distinct priced-country count per service (one GROUP BY, no N+1). */
  private async pricedCountryCounts(): Promise<Map<string, number>> {
    const rows = await this.rates
      .createQueryBuilder('r')
      .select('r.serviceKey', 'serviceKey')
      .addSelect('COUNT(DISTINCT r.countryCode)', 'cnt')
      .groupBy('r.serviceKey')
      .getRawMany<{ serviceKey: string; cnt: string }>();
    return new Map(rows.map((r) => [r.serviceKey, Number(r.cnt)]));
  }

  async create(dto: CreateServiceDto): Promise<ServiceProfile> {
    const existing = await this.services.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new AppException(
        { code: 'SERVICE_EXISTS', message: 'Service already exists' },
        409,
      );
    }
    const saved = await this.services.save(
      this.services.create({
        key: dto.key,
        name: dto.name,
        short: dto.short,
        provider: dto.provider || null,
        description: dto.description ?? null,
        status: dto.status ?? ServiceStatus.COMING_SOON,
      }),
    );
    this.logger.log({ event: 'service.created', key: saved.key }, 'Services');
    return presentService(saved);
  }

  async update(key: string, dto: UpdateServiceDto): Promise<ServiceProfile> {
    const service = await this.getOrFail(key);
    if (dto.name !== undefined) service.name = dto.name;
    if (dto.short !== undefined) service.short = dto.short;
    if (dto.provider !== undefined) service.provider = dto.provider || null;
    if (dto.description !== undefined)
      service.description = dto.description || null;
    if (dto.status !== undefined) service.status = dto.status;
    const saved = await this.services.save(service);
    this.logger.log(
      { event: 'service.updated', key: saved.key, status: saved.status },
      'Services',
    );
    return presentService(saved);
  }

  /** Hard-delete the service; its categories cascade (DB FK ON DELETE CASCADE). */
  async remove(key: string): Promise<void> {
    await this.getOrFail(key);
    await this.services.delete({ key });
    this.logger.log({ event: 'service.removed', key }, 'Services');
  }

  /* ----------------------------- categories ----------------------------- */

  async addCategory(
    serviceKey: string,
    dto: CreateCategoryDto,
  ): Promise<CategoryProfile> {
    await this.assertServiceExists(serviceKey);
    const dup = await this.categories.findOne({
      where: { serviceKey, key: dto.key },
    });
    if (dup) {
      throw new AppException(
        { code: 'SERVICE_CATEGORY_EXISTS', message: 'Category already exists' },
        409,
      );
    }
    const saved = await this.categories.save(
      this.categories.create({
        serviceKey,
        key: dto.key,
        label: dto.label,
        hint: dto.hint ?? null,
      }),
    );
    this.logger.log(
      {
        event: 'service.category.created',
        service: serviceKey,
        key: saved.key,
      },
      'Services',
    );
    return presentCategory(saved);
  }

  async updateCategory(
    serviceKey: string,
    catKey: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryProfile> {
    const category = await this.getCategoryOrFail(serviceKey, catKey);
    if (dto.label !== undefined) category.label = dto.label;
    if (dto.hint !== undefined) category.hint = dto.hint || null;
    const saved = await this.categories.save(category);
    this.logger.log(
      { event: 'service.category.updated', service: serviceKey, key: catKey },
      'Services',
    );
    return presentCategory(saved);
  }

  async removeCategory(serviceKey: string, catKey: string): Promise<void> {
    const category = await this.getCategoryOrFail(serviceKey, catKey);
    await this.categories.remove(category);
    // Drop any rate rows under this category so none are orphaned (the
    // category FK is app-enforced, so the DB won't cascade them).
    await this.rates.delete({ serviceKey, categoryKey: catKey });
    this.logger.log(
      { event: 'service.category.removed', service: serviceKey, key: catKey },
      'Services',
    );
  }

  /* ------------------------------ helpers ------------------------------- */

  private async getOrFail(key: string): Promise<Service> {
    const service = await this.services.findOne({
      where: { key },
      relations: { categories: true },
    });
    if (!service) {
      throw new AppException(
        { code: 'SERVICE_NOT_FOUND', message: 'Service not found' },
        404,
      );
    }
    return service;
  }

  /** 404 unless the service exists — also used by plans to validate scope. */
  async assertServiceExists(key: string): Promise<void> {
    const exists = await this.services.exists({ where: { key } });
    if (!exists) {
      throw new AppException(
        { code: 'SERVICE_NOT_FOUND', message: 'Service not found' },
        404,
      );
    }
  }

  private async getCategoryOrFail(
    serviceKey: string,
    key: string,
  ): Promise<ServiceCategory> {
    const category = await this.categories.findOne({
      where: { serviceKey, key },
    });
    if (!category) {
      throw new AppException(
        { code: 'SERVICE_CATEGORY_NOT_FOUND', message: 'Category not found' },
        404,
      );
    }
    return category;
  }
}
