import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { Plan } from '../plans/entities/plan.entity';
import { PLAN_LIMIT_KEYS } from '../plans/plan-keys';
import {
  WorkspaceMember,
  WorkspaceRole,
} from './entities/workspace-member.entity';
import { WorkspaceService } from './entities/workspace-service.entity';

/**
 * Cross-workspace plan rules (docs part-5 §21.4). Unlike per-workspace limits
 * (max members etc., enforced where they apply), these constrain the USER.
 * Fully data-driven: the ceiling comes off the plan row's `limits` jsonb —
 * launching a tier with a different cap is a seed, not a code change.
 */
@Injectable()
export class PlanLimitService {
  constructor(
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  /**
   * `max_workspaces_per_service`: how many workspaces a user may OWN per
   * service on this plan (absent/null = unlimited). Counts workspaces on the
   * SAME plan code — an upgraded workspace stops occupying the cheaper tier's
   * quota. Pass the creating transaction's manager: the check is only
   * race-proof inside the transaction, after the per-(user,service) advisory
   * lock.
   */
  async assertCanCreateWorkspace(
    plan: Plan,
    userId: string,
    serviceKey: string,
    em?: EntityManager,
  ): Promise<void> {
    const raw = plan.limits?.[PLAN_LIMIT_KEYS.maxWorkspacesPerService];
    const max = typeof raw === 'number' ? raw : null;
    if (max === null) return; // unlimited

    const repo = em ? em.getRepository(WorkspaceMember) : this.members;
    const owned = await repo
      .createQueryBuilder('m')
      .innerJoin('m.workspace', 'w')
      .innerJoin('w.plan', 'p')
      .innerJoin(WorkspaceService, 'ws', 'ws.workspace_id = w.id')
      .where('m.userId = :userId', { userId })
      .andWhere('m.role = :owner', { owner: WorkspaceRole.OWNER })
      .andWhere('p.code = :code', { code: plan.code })
      .andWhere('ws.service_key = :serviceKey', { serviceKey })
      .andWhere('w.deletedAt IS NULL')
      .getCount();

    if (owned >= max) {
      throw new AppException(
        {
          code: 'PLAN_LIMIT_REACHED',
          message: `The ${plan.code} plan allows ${max} workspace(s) per service`,
          details: { limit: PLAN_LIMIT_KEYS.maxWorkspacesPerService, max },
        },
        403,
      );
    }
  }
}
