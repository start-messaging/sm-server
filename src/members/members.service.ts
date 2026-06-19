import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { PlanLimitService } from '../workspaces/plan-limit.service';
import {
  MemberStatus,
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import {
  InvitationStatus,
  WorkspaceInvitation,
} from './entities/workspace-invitation.entity';
import {
  presentInvitation,
  presentMember,
  type MemberRoster,
  type MemberView,
} from './member-profile';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

/**
 * The workspace roster + member management (change role / remove). The acting
 * member comes from `WorkspaceContext` (already authed + role-gated to ADMIN by
 * the controller). Authority rule: an actor may only touch members **strictly
 * below their own rank** and may only assign roles strictly below it — so OWNER
 * is immutable (no transfer/step-down this slice) and the workspace always
 * keeps its owner.
 */
@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(WorkspaceInvitation)
    private readonly invitations: Repository<WorkspaceInvitation>,
    private readonly dataSource: DataSource,
    private readonly planLimits: PlanLimitService,
    private readonly logger: AppLogger,
  ) {}

  /** Active members (owner-first) + outstanding invitations. */
  async list(workspaceId: string): Promise<MemberRoster> {
    const [members, invitations] = await Promise.all([
      this.members.find({
        where: { workspaceId, status: MemberStatus.ACTIVE },
        relations: { user: true },
      }),
      this.invitations.find({
        where: { workspaceId, status: InvitationStatus.PENDING },
        order: { createdAt: 'DESC' },
      }),
    ]);
    members.sort(
      (a, b) =>
        ROLE_RANK[b.role] - ROLE_RANK[a.role] ||
        (a.user?.fullName ?? '').localeCompare(b.user?.fullName ?? ''),
    );
    return {
      members: members.map((m) => presentMember(m)),
      invitations: invitations.map(presentInvitation),
    };
  }

  async changeRole(
    ctx: WorkspaceContext,
    memberId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberView> {
    if (dto.role === WorkspaceRole.OWNER) {
      throw new AppException(
        {
          code: 'CANNOT_ASSIGN_OWNER',
          message: 'Ownership cannot be assigned',
        },
        400,
      );
    }
    const target = await this.loadManageableTarget(ctx, memberId);
    this.assertRoleBelowActor(ctx, dto.role); // can't promote to/above own rank

    // Promoting a non-agent to AGENT claims an agent seat — enforce the cap
    // under the same per-workspace lock the invite path uses (so a concurrent
    // invite-as-agent and this promotion can't jointly overshoot max_agents).
    const promotingToAgent =
      dto.role === WorkspaceRole.AGENT && target.role !== WorkspaceRole.AGENT;
    const saved = await this.dataSource.transaction(async (em) => {
      if (promotingToAgent && ctx.workspace.plan) {
        await em.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`member-invite:${ctx.workspace.id}`],
        );
        await this.planLimits.assertAgentSeat(
          ctx.workspace.plan,
          ctx.workspace.id,
          em,
        );
      }
      target.role = dto.role;
      return em.getRepository(WorkspaceMember).save(target);
    });
    this.logger.log(
      {
        event: 'workspace.member.role_changed',
        workspaceId: ctx.workspace.id,
        memberId,
        role: dto.role,
        by: ctx.membership.userId,
      },
      'Members',
    );
    const withUser = await this.members.findOne({
      where: { id: saved.id },
      relations: { user: true },
    });
    return presentMember(withUser ?? saved);
  }

  async remove(ctx: WorkspaceContext, memberId: string): Promise<void> {
    const target = await this.loadManageableTarget(ctx, memberId);
    await this.members.softRemove(target);
    this.logger.log(
      {
        event: 'workspace.member.removed',
        workspaceId: ctx.workspace.id,
        memberId,
        by: ctx.membership.userId,
      },
      'Members',
    );
  }

  /* ------------------------------ helpers ------------------------------- */

  /**
   * Load a member of THIS workspace that the actor is allowed to act on:
   * exists, is not the actor themselves, is not the OWNER, and ranks strictly
   * below the actor. Same 404/403/400 codes the staff flow uses.
   */
  private async loadManageableTarget(
    ctx: WorkspaceContext,
    memberId: string,
  ): Promise<WorkspaceMember> {
    const target = await this.members.findOne({
      where: { id: memberId, workspaceId: ctx.workspace.id },
    });
    if (!target) {
      throw new AppException(
        { code: 'MEMBER_NOT_FOUND', message: 'Member not found' },
        404,
      );
    }
    if (target.userId === ctx.membership.userId) {
      throw new AppException(
        {
          code: 'MEMBER_SELF_ACTION',
          message: 'You cannot change your own membership here',
        },
        400,
      );
    }
    if (target.role === WorkspaceRole.OWNER) {
      throw new AppException(
        {
          code: 'CANNOT_MODIFY_OWNER',
          message: 'The workspace owner cannot be changed',
        },
        403,
      );
    }
    this.assertRoleBelowActor(ctx, target.role);
    return target;
  }

  /** A role must rank strictly below the actor's own role. */
  private assertRoleBelowActor(
    ctx: WorkspaceContext,
    role: WorkspaceRole,
  ): void {
    if (ROLE_RANK[role] >= ROLE_RANK[ctx.membership.role]) {
      throw new AppException(
        {
          code: 'WORKSPACE_ROLE_FORBIDDEN',
          message: 'You can only manage members below your own role',
        },
        403,
      );
    }
  }
}
