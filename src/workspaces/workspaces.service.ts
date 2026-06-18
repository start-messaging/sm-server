import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { slugify, slugSuffix } from '../common/slug/slugify';
import { CountriesService } from '../countries/countries.service';
import { PlansService } from '../plans/plans.service';
import { ServicesPublicService } from '../services/services-public.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { WalletTxSubType } from '../wallets/entities/wallet-transaction.entity';
import { WalletService } from '../wallets/wallet.service';
import {
  presentWalletBalance,
  type WalletBalanceView,
} from '../wallets/wallet-view';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from './entities/workspace-member.entity';
import {
  WorkspaceService,
  WorkspaceServiceStatus,
} from './entities/workspace-service.entity';
import { Workspace, WorkspaceStatus } from './entities/workspace.entity';
import { PlanLimitService } from './plan-limit.service';
import {
  presentCurrentWorkspace,
  presentWorkspaceSummary,
  type CurrentWorkspaceProfile,
  type WorkspaceSummary,
} from './workspace-profiles';

/** Attempts at slug uniqueness: base name first, then random suffixes. */
const SLUG_ATTEMPTS = 3;

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceService)
    private readonly wsServices: Repository<WorkspaceService>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly countries: CountriesService,
    private readonly servicesPublic: ServicesPublicService,
    private readonly plans: PlansService,
    private readonly planLimits: PlanLimitService,
    private readonly wallets: WalletService,
    private readonly logger: AppLogger,
  ) {}

  /**
   * Create a workspace under a service: country/currency locked from the
   * owner's verified mobile, FREE plan, OWNER membership, and a pending_setup
   * service row — one transaction, retried only for slug collisions.
   */
  async createForService(
    userId: string,
    serviceKey: string,
    dto: CreateWorkspaceDto,
  ): Promise<WorkspaceSummary> {
    const user = await this.users.getById(userId);
    const countryCode = this.assertOnboarded(user);

    const country = await this.countries.findActive(countryCode);
    if (!country) {
      throw new AppException(
        {
          code: 'COUNTRY_NOT_SUPPORTED',
          message: 'This country is not supported yet',
        },
        400,
      );
    }

    // The service must be sellable in the owner's country (same rule that
    // builds the gallery: active|beta + an active rate row).
    const available =
      await this.servicesPublic.listAvailableForCountry(countryCode);
    if (!available.some((s) => s.key === serviceKey)) {
      throw new AppException(
        {
          code: 'SERVICE_NOT_AVAILABLE',
          message: 'This service is not available in your country',
        },
        400,
      );
    }

    const plan = await this.plans.getFreePlan(serviceKey);

    const baseSlug = slugify(dto.name);
    for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${slugSuffix()}`;
      try {
        const workspace = await this.dataSource.transaction(async (em) => {
          // The cap check must be atomic with the insert (no constraint can
          // express "one FREE workspace per service per OWNER"): a
          // transaction-scoped advisory lock serializes concurrent creates by
          // the same user for the same service, then the count runs inside
          // the same transaction.
          await em.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
            [`workspace-create:${userId}:${serviceKey}`],
          );
          await this.planLimits.assertCanCreateWorkspace(
            plan,
            userId,
            serviceKey,
            em,
          );
          const ws = await em.save(
            em.create(Workspace, {
              name: dto.name,
              slug,
              countryCode,
              defaultCurrency: country.currencyCode,
              planId: plan.id,
              status: WorkspaceStatus.ACTIVE,
            }),
          );
          await em.save(
            em.create(WorkspaceMember, {
              workspaceId: ws.id,
              userId,
              role: WorkspaceRole.OWNER,
              status: MemberStatus.ACTIVE,
              invitedBy: null,
              joinedAt: new Date(),
            }),
          );
          await em.save(
            em.create(WorkspaceService, {
              workspaceId: ws.id,
              serviceKey,
              status: WorkspaceServiceStatus.PENDING_SETUP,
            }),
          );
          // The wallet is part of the same atomic unit (docs T2): a workspace
          // never exists without one. Currency is locked to the workspace.
          await this.wallets.createWallet(em, {
            workspaceId: ws.id,
            currency: country.currencyCode,
          });
          await this.creditSignupBonus(em, ws, country.currencyCode);
          return ws;
        });
        workspace.plan = plan;
        this.logger.log(
          {
            event: 'workspace.created',
            id: workspace.id,
            slug: workspace.slug,
            serviceKey,
            userId,
          },
          'Workspaces',
        );
        return presentWorkspaceSummary(workspace, serviceKey, {
          role: WorkspaceRole.OWNER,
        });
      } catch (err) {
        // Slug collision aborts the whole transaction — regenerate and retry.
        if (this.isSlugCollision(err) && attempt < SLUG_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    // Unreachable: the loop either returns or throws.
    throw new Error('workspace slug retries exhausted');
  }

  /**
   * Promotional credit at signup. The per-country amount belongs in
   * `plan_pricing.signup_bonus_micros` (Phase 7) — that table isn't built yet,
   * and a single cross-currency micros constant would be wrong, so the amount
   * resolves to 0 today and no ledger row is written. The credit MECHANISM
   * (idempotent, ledger-backed) is wired here so it lights up the moment
   * plan_pricing supplies a real per-country figure.
   */
  private async creditSignupBonus(
    em: EntityManager,
    workspace: Workspace,
    currency: string,
  ): Promise<void> {
    const bonusMicros = 0; // TODO(Phase 7): plan_pricing.signup_bonus_micros
    if (bonusMicros <= 0) return;
    await this.wallets.credit(
      {
        workspaceId: workspace.id,
        amountMicros: bonusMicros,
        currency,
        subType: WalletTxSubType.SIGNUP_BONUS,
        referenceType: 'promotion',
        referenceId: workspace.id,
        idempotencyKey: `signup_bonus:${workspace.id}`,
      },
      em,
    );
  }

  /** Every workspace the user is an active member of, with its service + role. */
  async listMine(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.members.find({
      where: { userId, status: MemberStatus.ACTIVE },
      relations: { workspace: { plan: true } },
      order: { createdAt: 'ASC' },
    });
    const live = memberships.filter(
      (m): m is WorkspaceMember & { workspace: Workspace } =>
        !!m.workspace && m.workspace.status === WorkspaceStatus.ACTIVE,
    );
    if (live.length === 0) return [];

    const serviceRows = await this.wsServices.find({
      where: { workspaceId: In(live.map((m) => m.workspaceId)) },
    });
    const serviceByWorkspace = new Map(
      serviceRows.map((r) => [r.workspaceId, r.serviceKey]),
    );
    return live.map((m) =>
      presentWorkspaceSummary(
        m.workspace,
        serviceByWorkspace.get(m.workspaceId) ?? '',
        m,
      ),
    );
  }

  /**
   * Present a guard-resolved workspace context (GET /workspaces/:slug —
   * WorkspaceMemberGuard already did the membership/404 work).
   */
  async presentContext(ctx: {
    workspace: Workspace;
    membership: WorkspaceMember;
  }): Promise<CurrentWorkspaceProfile> {
    const serviceRow = await this.wsServices.findOne({
      where: { workspaceId: ctx.workspace.id },
    });
    return presentCurrentWorkspace(
      ctx.workspace,
      serviceRow?.serviceKey ?? '',
      ctx.membership,
    );
  }

  /** Read-only wallet balance for a workspace member (guard already authed). */
  async getWalletForContext(ctx: {
    workspace: Workspace;
  }): Promise<WalletBalanceView> {
    const wallet = await this.wallets.ensureWallet(
      ctx.workspace.id,
      ctx.workspace.defaultCurrency,
    );
    return presentWalletBalance(wallet);
  }

  private assertOnboarded(user: User): string {
    if (!user.mobileVerified || !user.countryCode) {
      throw new AppException(
        {
          code: 'COUNTRY_NOT_SET',
          message: 'Verify your mobile number first',
        },
        403,
      );
    }
    return user.countryCode;
  }

  private isSlugCollision(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err.driverError as { code?: string; constraint?: string }).code ===
        '23505' &&
      (err.driverError as { constraint?: string }).constraint ===
        'uq_workspaces_slug'
    );
  }
}
