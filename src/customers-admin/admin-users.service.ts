import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { paginate, type Paginated } from '../common/types/pagination';
import { Service } from '../services/entities/service.entity';
import { User } from '../users/entities/user.entity';
import {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import type {
  AdminUserDetail,
  AdminUserListItem,
  AdminUserWorkspaceCard,
} from './admin-user-profile';
import {
  AdminUsersQueryDto,
  ROLE_FILTER_NONE,
} from './dto/admin-users-query.dto';

/** Staff-facing READ surface over customers. No writes — signup is the only door. */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceService)
    private readonly wsServices: Repository<WorkspaceService>,
    @InjectRepository(WorkspaceServiceRate)
    private readonly ladders: Repository<WorkspaceServiceRate>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
  ) {}

  async list(query: AdminUsersQueryDto): Promise<Paginated<AdminUserListItem>> {
    const qb = this.users.createQueryBuilder('u');
    if (query.search) {
      qb.andWhere('(u.email ILIKE :s OR u.full_name ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }
    if (query.status) {
      qb.andWhere('u.status = :status', { status: query.status });
    }
    this.applyRoleFilter(qb, query.role);
    qb.orderBy('u.created_at', 'DESC').skip(query.skip).take(query.take);
    const [rows, total] = await qb.getManyAndCount();

    const ids = rows.map((u) => u.id);
    const [counts, roles] = await Promise.all([
      this.workspaceCounts(ids),
      this.rolesByUser(ids),
    ]);
    return paginate(
      rows.map((u) =>
        this.presentListItem(u, counts.get(u.id) ?? 0, roles.get(u.id) ?? []),
      ),
      total,
      query,
    );
  }

  /**
   * Restrict the list to users with (or, for `none`, without) an active
   * membership of the given role on a non-deleted workspace.
   */
  private applyRoleFilter(
    qb: ReturnType<Repository<User>['createQueryBuilder']>,
    role?: string,
  ): void {
    if (!role) return;
    const live =
      'SELECT 1 FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id' +
      " WHERE m.user_id = u.id AND m.status = 'active' AND w.deleted_at IS NULL";
    if (role === ROLE_FILTER_NONE) {
      qb.andWhere(`NOT EXISTS (${live})`);
    } else {
      qb.andWhere(`EXISTS (${live} AND m.role = :role)`, { role });
    }
  }

  async getDetail(id: string): Promise<AdminUserDetail> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) {
      throw new AppException(
        { code: 'USER_NOT_FOUND', message: 'User not found' },
        404,
      );
    }

    const memberships = await this.members.find({
      where: { userId: id, status: MemberStatus.ACTIVE },
      relations: { workspace: { plan: true } },
      order: { createdAt: 'ASC' },
    });
    // Relations don't apply the soft-delete filter — drop deleted workspaces.
    const live = memberships.filter(
      (
        m,
      ): m is WorkspaceMember & {
        workspace: NonNullable<WorkspaceMember['workspace']>;
      } => !!m.workspace && !m.workspace.deletedAt,
    );

    const workspaceIds = live.map((m) => m.workspaceId);
    const [serviceRows, services, overrides] = await Promise.all([
      workspaceIds.length
        ? this.wsServices.find({ where: { workspaceId: In(workspaceIds) } })
        : Promise.resolve([]),
      this.services.find(),
      this.overrideCounts(workspaceIds),
    ]);
    const serviceByWorkspace = new Map(
      serviceRows.map((r) => [r.workspaceId, r.serviceKey]),
    );
    const serviceNames = new Map(services.map((s) => [s.key, s.name]));

    const workspaces: AdminUserWorkspaceCard[] = live.map((m) => {
      const serviceKey = serviceByWorkspace.get(m.workspaceId) ?? '';
      return {
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        serviceKey,
        serviceName: serviceNames.get(serviceKey) ?? serviceKey,
        countryCode: m.workspace.countryCode,
        defaultCurrency: m.workspace.defaultCurrency,
        planCode: m.workspace.plan?.code ?? '',
        planName: m.workspace.plan?.name ?? '',
        role: m.role,
        status: m.workspace.status,
        overrideCount: overrides.get(m.workspaceId) ?? 0,
        createdAt: m.workspace.createdAt,
      };
    });

    const roles = [...new Set(live.map((m) => m.role))];
    return {
      user: {
        ...this.presentListItem(user, workspaces.length, roles),
        emailVerified: user.emailVerified,
        mobileE164: user.mobileE164,
        locale: user.locale,
      },
      workspaces,
    };
  }

  /* ------------------------------ helpers ------------------------------- */

  private presentListItem(
    user: User,
    workspacesCount: number,
    roles: WorkspaceRole[],
  ): AdminUserListItem {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      countryCode: user.countryCode,
      status: user.status,
      mobileVerified: user.mobileVerified,
      workspacesCount,
      roles,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  /** Distinct active roles per user (on non-deleted workspaces). */
  private async rolesByUser(
    userIds: string[],
  ): Promise<Map<string, WorkspaceRole[]>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin('m.workspace', 'w')
      .select('m.user_id', 'userId')
      // json_agg → the pg driver parses it to a real JS array (array_agg comes
      // back as a `{OWNER}` literal string).
      .addSelect('json_agg(DISTINCT m.role)', 'roles')
      .where('m.user_id IN (:...ids)', { ids: userIds })
      .andWhere('m.status = :status', { status: MemberStatus.ACTIVE })
      .andWhere('w.deleted_at IS NULL')
      .groupBy('m.user_id')
      .getRawMany<{ userId: string; roles: WorkspaceRole[] }>();
    return new Map(rows.map((r) => [r.userId, r.roles]));
  }

  /** Active-membership workspace count per user (soft-deleted workspaces excluded). */
  private async workspaceCounts(
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.members
      .createQueryBuilder('m')
      .innerJoin('m.workspace', 'w')
      .select('m.user_id', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('m.user_id IN (:...ids)', { ids: userIds })
      .andWhere('m.status = :status', { status: MemberStatus.ACTIVE })
      .andWhere('w.deleted_at IS NULL')
      .groupBy('m.user_id')
      .getRawMany<{ userId: string; count: string }>();
    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }

  /** DISTINCT overridden (service, country, category) CELLS per workspace. */
  private async overrideCounts(
    workspaceIds: string[],
  ): Promise<Map<string, number>> {
    if (workspaceIds.length === 0) return new Map();
    const rows = await this.ladders
      .createQueryBuilder('r')
      .select('r.workspace_id', 'workspaceId')
      .addSelect(
        'COUNT(DISTINCT (r.service_key, r.country_code, r.category_key))',
        'count',
      )
      .where('r.workspace_id IN (:...ids)', { ids: workspaceIds })
      .groupBy('r.workspace_id')
      .getRawMany<{ workspaceId: string; count: string }>();
    return new Map(rows.map((r) => [r.workspaceId, Number(r.count)]));
  }
}
