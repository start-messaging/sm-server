import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { CountriesService } from '../countries/countries.service';
import { RateResolverService } from '../pricing/rate-resolver.service';
import type { ResolvedRate } from '../pricing/resolved-rate';
import { ServiceCountryRate } from '../services/entities/service-country-rate.entity';
import { ServiceCategory } from '../services/entities/service-category.entity';
import { Service } from '../services/entities/service.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { PutLadderDto } from './dto/put-ladder.dto';
import {
  buildWorkspaceRatesView,
  type LadderRungProfile,
  type WorkspaceRatesView,
} from './workspace-rates-view';

/** The PUT/DELETE response: one cell's ladder after the write. */
export interface LadderCellProfile {
  countryCode: string;
  categoryKey: string;
  currency: string;
  rungs: LadderRungProfile[];
}

/**
 * Workspace-tier pricing (the unified ladder) — staff CRUD over one
 * workspace's overrides for one service. A cell's ladder is replaced
 * WHOLESALE inside a transaction under an advisory lock (concurrent PUTs to
 * the same cell serialize; the unique index is the 23505 → 409 backstop).
 */
@Injectable()
export class WorkspaceRatesService {
  constructor(
    @InjectRepository(WorkspaceServiceRate)
    private readonly ladders: Repository<WorkspaceServiceRate>,
    @InjectRepository(ServiceCountryRate)
    private readonly baseRates: Repository<ServiceCountryRate>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceService)
    private readonly wsServices: Repository<WorkspaceService>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    private readonly countries: CountriesService,
    private readonly rateResolver: RateResolverService,
    private readonly dataSource: DataSource,
    private readonly logger: AppLogger,
  ) {}

  /** Grouped per-country / per-category view: base rates + this workspace's ladders. */
  async getRates(
    workspaceId: string,
    serviceKey: string,
  ): Promise<WorkspaceRatesView> {
    const { workspace, service } = await this.getCellContext(
      workspaceId,
      serviceKey,
    );
    const [baseRows, ladderRows] = await Promise.all([
      this.baseRates.find({
        where: { serviceKey },
        relations: { country: true, currencyRef: true },
      }),
      this.ladders.find({
        where: { workspaceId, serviceKey },
        relations: { country: true, currencyRef: true },
        order: { minQty: 'ASC' },
      }),
    ]);
    return buildWorkspaceRatesView(workspace, service, baseRows, ladderRows);
  }

  /** Replace one (country, category) cell's ladder wholesale. */
  async replaceLadder(
    workspaceId: string,
    serviceKey: string,
    countryCode: string,
    categoryKey: string,
    dto: PutLadderDto,
  ): Promise<LadderCellProfile> {
    const { service } = await this.getCellContext(workspaceId, serviceKey);
    this.assertCategory(service, categoryKey);
    const cc = countryCode.toUpperCase();
    const country = await this.countries.getForLink(cc);
    if (dto.currency !== country.currencyCode) {
      throw new AppException(
        {
          code: 'RATE_CURRENCY_MISMATCH',
          message: `Ladder currency must be ${country.currencyCode} for ${cc}`,
        },
        422,
      );
    }

    const rungs = [...dto.rungs].sort((a, b) => a.minQty - b.minQty);
    try {
      await this.dataSource.transaction(async (em) => {
        // Wholesale replace must be atomic per cell: the advisory lock
        // serializes concurrent PUTs to the same cell so delete+insert can't
        // interleave (the unique index would only catch identical minQty).
        await em.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`ws-ladder:${workspaceId}:${serviceKey}:${cc}:${categoryKey}`],
        );
        await em.delete(WorkspaceServiceRate, {
          workspaceId,
          serviceKey,
          countryCode: cc,
          categoryKey,
        });
        await em.save(
          rungs.map((r) =>
            em.create(WorkspaceServiceRate, {
              workspaceId,
              serviceKey,
              countryCode: cc,
              categoryKey,
              minQty: r.minQty,
              sellMicros: r.sellMicros,
              currency: country.currencyCode,
              isActive: true,
            }),
          ),
        );
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new AppException(
          {
            code: 'LADDER_CONFLICT',
            message: 'The ladder changed concurrently — retry',
          },
          409,
        );
      }
      throw err;
    }

    await this.rateResolver.invalidate(serviceKey, cc);
    this.logger.log(
      {
        event: 'workspace.ladder.replaced',
        workspaceId,
        service: serviceKey,
        country: cc,
        category: categoryKey,
        rungs: rungs.length,
      },
      'CustomersAdmin',
    );
    return {
      countryCode: cc,
      categoryKey,
      currency: country.currencyCode,
      rungs: rungs.map((r) => ({ minQty: r.minQty, sellMicros: r.sellMicros })),
    };
  }

  /** Clear one cell's override — the cell returns to the country base rate. */
  async clearLadder(
    workspaceId: string,
    serviceKey: string,
    countryCode: string,
    categoryKey: string,
  ): Promise<void> {
    await this.getCellContext(workspaceId, serviceKey);
    const cc = countryCode.toUpperCase();
    const result = await this.ladders.delete({
      workspaceId,
      serviceKey,
      countryCode: cc,
      categoryKey,
    });
    if (!result.affected) {
      throw new AppException(
        { code: 'LADDER_NOT_FOUND', message: 'This cell has no override' },
        404,
      );
    }
    await this.rateResolver.invalidate(serviceKey, cc);
    this.logger.log(
      {
        event: 'workspace.ladder.cleared',
        workspaceId,
        service: serviceKey,
        country: cc,
        category: categoryKey,
      },
      'CustomersAdmin',
    );
  }

  /**
   * Preview what this workspace would pay for a (country, category) send at a
   * given monthly volume — answers "what's the effective per-message price?"
   * straight from the two-tier resolver (cold, so it reflects current config).
   */
  async resolvePreview(
    workspaceId: string,
    serviceKey: string,
    countryCode: string,
    categoryKey: string,
    qty: number,
  ): Promise<ResolvedRate> {
    const { service } = await this.getCellContext(workspaceId, serviceKey);
    this.assertCategory(service, categoryKey);
    return this.rateResolver.resolveCold({
      workspaceId,
      serviceKey,
      countryCode,
      categoryKey,
      qty,
    });
  }

  /* ------------------------------ helpers ------------------------------- */

  /** Workspace exists → service exists → workspace is enrolled in it. */
  private async getCellContext(
    workspaceId: string,
    serviceKey: string,
  ): Promise<{ workspace: Workspace; service: Service }> {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new AppException(
        { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        404,
      );
    }
    const service = await this.services.findOne({
      where: { key: serviceKey },
      relations: { categories: true },
    });
    if (!service) {
      throw new AppException(
        { code: 'SERVICE_NOT_FOUND', message: 'Service not found' },
        404,
      );
    }
    const enrolled = await this.wsServices.exists({
      where: { workspaceId, serviceKey },
    });
    if (!enrolled) {
      throw new AppException(
        {
          code: 'WORKSPACE_SERVICE_NOT_FOUND',
          message: 'This workspace does not run that service',
        },
        404,
      );
    }
    return { workspace, service };
  }

  private assertCategory(service: Service, categoryKey: string): void {
    const exists = (service.categories ?? []).some(
      (c: ServiceCategory) => c.key === categoryKey,
    );
    if (!exists) {
      throw new AppException(
        {
          code: 'SERVICE_CATEGORY_NOT_FOUND',
          message: 'Category does not belong to this service',
        },
        400,
      );
    }
  }
}
