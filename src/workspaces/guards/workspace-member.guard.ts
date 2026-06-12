import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { AppException } from '../../common/exceptions/app.exception';
import { MIN_ROLE_KEY } from '../decorators/min-role.decorator';
import {
  MemberStatus,
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../entities/workspace-member.entity';
import { Workspace, WorkspaceStatus } from '../entities/workspace.entity';

/** What the guard attaches to the request for handlers/decorators. */
export interface WorkspaceContext {
  workspace: Workspace;
  membership: WorkspaceMember;
}

export interface WorkspaceScopedRequest extends Request {
  user: AuthenticatedUser;
  workspaceCtx: WorkspaceContext;
}

/**
 * Resolves the `:slug` route param into the workspace + the caller's
 * membership, enforcing an optional @MinRole. URL = the workspace context
 * (no active-workspace JWT claim), so this runs per request — deep links and
 * multi-tab use just work. Run AFTER JwtAuthGuard:
 * `@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)`.
 * Non-members get the same 404 as a missing slug — membership is not leaked.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceScopedRequest>();
    const slug = req.params.slug;
    if (typeof slug !== 'string' || !slug) {
      throw new AppException(
        { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        404,
      );
    }

    // Suspended workspaces are hidden the same way everywhere (listMine
    // filters them too): to users they 404 like any unknown slug.
    const workspace = await this.workspaces.findOne({
      where: { slug, status: WorkspaceStatus.ACTIVE },
      relations: { plan: true },
    });
    const membership = workspace
      ? await this.members.findOne({
          where: {
            workspaceId: workspace.id,
            userId: req.user.id,
            status: MemberStatus.ACTIVE,
          },
        })
      : null;
    if (!workspace || !membership) {
      throw new AppException(
        { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        404,
      );
    }

    const minRole = this.reflector.getAllAndOverride<WorkspaceRole | undefined>(
      MIN_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (minRole && ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
      throw new AppException(
        {
          code: 'WORKSPACE_ROLE_FORBIDDEN',
          message: 'Your role does not allow this action',
        },
        403,
      );
    }

    req.workspaceCtx = { workspace, membership };
    return true;
  }
}
