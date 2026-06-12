import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { ServicesService } from '../services/services.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Plan, PlanStatus } from './entities/plan.entity';
import { presentPlan, type PlanProfile } from './plan-profile';

export const FREE_PLAN_CODE = 'FREE';

/**
 * Subscription plans: read access for workspace creation + staff CRUD.
 * Entitlements are open key-value data — adding a key is an admin edit on a
 * row, never a deploy (the server enforces only the keys in plan-keys.ts).
 */
@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan) private readonly plans: Repository<Plan>,
    private readonly services: ServicesService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * The FREE plan for a service: the ACTIVE service-specific row when one
   * exists, else the ACTIVE global (service_key NULL) fallback. Deprecated or
   * hidden rows never attach to new workspaces; missing both = unseeded DB or
   * an admin retired FREE without a replacement.
   */
  async getFreePlan(serviceKey: string): Promise<Plan> {
    const plan =
      (await this.plans.findOne({
        where: { code: FREE_PLAN_CODE, serviceKey, status: PlanStatus.ACTIVE },
      })) ??
      (await this.plans.findOne({
        where: {
          code: FREE_PLAN_CODE,
          serviceKey: IsNull(),
          status: PlanStatus.ACTIVE,
        },
      }));
    if (!plan) {
      throw new AppException(
        {
          code: 'PLAN_NOT_CONFIGURED',
          message: `Plan ${FREE_PLAN_CODE} is not configured — run db:seed`,
        },
        500,
      );
    }
    return plan;
  }

  /** All plans, global fallbacks first, then per-service rows by tier. */
  async listAll(): Promise<PlanProfile[]> {
    const rows = await this.plans
      .createQueryBuilder('p')
      .orderBy('p.service_key', 'ASC', 'NULLS FIRST')
      .addOrderBy('p.tier', 'ASC')
      .addOrderBy('p.code', 'ASC')
      .getMany();
    return rows.map(presentPlan);
  }

  async create(dto: CreatePlanDto): Promise<PlanProfile> {
    if (dto.serviceKey) {
      await this.services.assertServiceExists(dto.serviceKey);
    }
    const existing = await this.plans.findOne({
      where: {
        code: dto.code,
        serviceKey: dto.serviceKey ? dto.serviceKey : IsNull(),
      },
    });
    if (existing) {
      throw new AppException(
        { code: 'PLAN_EXISTS', message: 'Plan already exists for this scope' },
        409,
      );
    }
    try {
      const saved = await this.plans.save(
        this.plans.create({
          code: dto.code,
          serviceKey: dto.serviceKey ?? null,
          name: dto.name,
          tier: dto.tier ?? 0,
          trialDays: dto.trialDays ?? 0,
          status: dto.status ?? PlanStatus.ACTIVE,
          features: dto.features ?? {},
          limits: dto.limits ?? {},
        }),
      );
      this.logger.log(
        {
          event: 'plan.created',
          code: saved.code,
          serviceKey: saved.serviceKey,
        },
        'Plans',
      );
      return presentPlan(saved);
    } catch (err) {
      // Concurrent creates race past the find-then-create check; the partial
      // unique indexes settle it — the loser gets the normal 409.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new AppException(
          {
            code: 'PLAN_EXISTS',
            message: 'Plan already exists for this scope',
          },
          409,
        );
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdatePlanDto): Promise<PlanProfile> {
    const plan = await this.getOrFail(id);
    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.tier !== undefined) plan.tier = dto.tier;
    if (dto.trialDays !== undefined) plan.trialDays = dto.trialDays;
    if (dto.status !== undefined) plan.status = dto.status;
    if (dto.features !== undefined) plan.features = dto.features;
    if (dto.limits !== undefined) plan.limits = dto.limits;
    const saved = await this.plans.save(plan);
    this.logger.log(
      {
        event: 'plan.updated',
        code: saved.code,
        serviceKey: saved.serviceKey,
        status: saved.status,
      },
      'Plans',
    );
    return presentPlan(saved);
  }

  private async getOrFail(id: string): Promise<Plan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) {
      throw new AppException(
        { code: 'PLAN_NOT_FOUND', message: 'Plan not found' },
        404,
      );
    }
    return plan;
  }
}
