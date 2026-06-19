import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import {
  InvitationStatus,
  WorkspaceInvitation,
} from '../members/entities/workspace-invitation.entity';
import {
  MemberStatus,
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import type { AdminWorkspaceDetail } from './admin-workspace-profile';

/** Staff-facing READ surface over a single workspace (the 360° header). */
@Injectable()
export class AdminWorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceService)
    private readonly wsServices: Repository<WorkspaceService>,
    @InjectRepository(WorkspaceServiceRate)
    private readonly ladders: Repository<WorkspaceServiceRate>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitations: Repository<WorkspaceInvitation>,
  ) {}

  async getDetail(id: string): Promise<AdminWorkspaceDetail> {
    const workspace = await this.workspaces.findOne({
      where: { id },
      relations: { plan: true, country: true },
    });
    if (!workspace) {
      throw new AppException(
        { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        404,
      );
    }

    const [memberRows, serviceRows, invitationRows, overrideCount] =
      await Promise.all([
        this.members.find({
          where: { workspaceId: id },
          relations: { user: true },
        }),
        this.wsServices.find({
          where: { workspaceId: id },
          relations: { service: true },
        }),
        this.invitations.find({
          where: { workspaceId: id, status: InvitationStatus.PENDING },
          order: { createdAt: 'DESC' },
        }),
        this.countOverrides(id),
      ]);

    // Owner-first, then alphabetical — one row (the owner) until invites ship.
    const members = memberRows
      .filter((m) => !!m.user)
      .sort(
        (a, b) =>
          ROLE_RANK[b.role] - ROLE_RANK[a.role] ||
          (a.user!.fullName ?? '').localeCompare(b.user!.fullName ?? ''),
      )
      .map((m) => ({
        userId: m.user!.id,
        fullName: m.user!.fullName,
        email: m.user!.email,
        role: m.role,
        status: m.status,
      }));
    const owner = memberRows.find((m) => m.role === WorkspaceRole.OWNER);
    const membersCount = memberRows.filter(
      (m) => m.status === MemberStatus.ACTIVE,
    ).length;

    return {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      status: workspace.status,
      countryCode: workspace.countryCode,
      countryName: workspace.country?.name ?? workspace.countryCode,
      defaultCurrency: workspace.defaultCurrency,
      timezone: workspace.timezone,
      createdAt: workspace.createdAt,
      plan: workspace.plan
        ? {
            id: workspace.plan.id,
            code: workspace.plan.code,
            name: workspace.plan.name,
          }
        : null,
      owner: owner?.user
        ? {
            id: owner.user.id,
            fullName: owner.user.fullName,
            email: owner.user.email,
          }
        : null,
      membersCount,
      members,
      invitations: invitationRows.map((inv) => ({
        email: inv.email,
        role: inv.role,
        invitedAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      })),
      services: serviceRows.map((r) => ({
        serviceKey: r.serviceKey,
        serviceName: r.service?.name ?? r.serviceKey,
        status: r.status,
        activatedAt: r.activatedAt,
      })),
      overrideCount,
    };
  }

  /** DISTINCT overridden (service, country, category) cells — not rung rows. */
  private async countOverrides(workspaceId: string): Promise<number> {
    const row = await this.ladders
      .createQueryBuilder('r')
      .select(
        'COUNT(DISTINCT (r.service_key, r.country_code, r.category_key))',
        'count',
      )
      .where('r.workspace_id = :workspaceId', { workspaceId })
      .getRawOne<{ count: string }>();
    return Number(row?.count ?? 0);
  }
}
