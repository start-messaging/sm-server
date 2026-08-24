import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import {
  InvitationStatus,
  WorkspaceInvitation,
} from '../members/entities/workspace-invitation.entity';
import { Plan } from '../plans/entities/plan.entity';
import { PLAN_LIMIT_KEYS } from '../plans/plan-keys';
import { WaContact } from '../whatsapp/entities/wa-contact.entity';
import {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from './entities/workspace-member.entity';
import { WorkspaceService } from './entities/workspace-service.entity';

/** Numeric plan limit for a key; null/absent/non-number = unlimited. */
function numLimit(plan: Plan, key: string): number | null {
  const raw = plan.limits?.[key];
  return typeof raw === 'number' ? raw : null;
}

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
    @InjectRepository(WorkspaceInvitation)
    private readonly invitations: Repository<WorkspaceInvitation>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
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
    const max = numLimit(plan, PLAN_LIMIT_KEYS.maxWorkspacesPerService);
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

  /**
   * `max_members` (and `max_agents` when inviting an AGENT) per workspace.
   * **Reserved-seat** counting: a seat is held the moment an invite is sent, so
   * the count is active members + PENDING invitations. Because accept is a 1:1
   * pending→active conversion it consumes no new seat — the cap can't be
   * overshot, so accept needs no re-check. Call inside the invite transaction,
   * after the per-workspace advisory lock, so count+insert is race-proof.
   */
  async assertCanInviteMember(
    plan: Plan,
    workspaceId: string,
    role: WorkspaceRole,
    em?: EntityManager,
  ): Promise<void> {
    const memberRepo = em ? em.getRepository(WorkspaceMember) : this.members;
    const inviteRepo = em
      ? em.getRepository(WorkspaceInvitation)
      : this.invitations;

    const maxMembers = numLimit(plan, PLAN_LIMIT_KEYS.maxMembers);
    if (maxMembers !== null) {
      const [activeMembers, pendingInvites] = await Promise.all([
        memberRepo.count({
          where: { workspaceId, status: MemberStatus.ACTIVE },
        }),
        inviteRepo.count({
          where: { workspaceId, status: InvitationStatus.PENDING },
        }),
      ]);
      if (activeMembers + pendingInvites >= maxMembers) {
        throw new AppException(
          {
            code: 'PLAN_LIMIT_REACHED',
            message: `The ${plan.code} plan allows ${maxMembers} member(s) per workspace`,
            details: { limit: PLAN_LIMIT_KEYS.maxMembers, max: maxMembers },
          },
          403,
        );
      }
    }

    if (role === WorkspaceRole.AGENT) {
      await this.assertAgentSeat(plan, workspaceId, em);
    }
  }

  /**
   * The `max_agents` reserved-seat check on its own — for paths that turn a
   * non-agent into an AGENT without adding a member (re-inviting a pending
   * invite as AGENT, or promoting a member via change-role). Counts active
   * AGENT members + pending AGENT invitations; the row being promoted is not
   * yet an AGENT, so it isn't counted — the check verifies room for one more.
   * Call under the per-workspace advisory lock for race-safety.
   */
  async assertAgentSeat(
    plan: Plan,
    workspaceId: string,
    em?: EntityManager,
  ): Promise<void> {
    const maxAgents = numLimit(plan, PLAN_LIMIT_KEYS.maxAgents);
    if (maxAgents === null) return;
    const memberRepo = em ? em.getRepository(WorkspaceMember) : this.members;
    const inviteRepo = em
      ? em.getRepository(WorkspaceInvitation)
      : this.invitations;
    const [activeAgents, pendingAgentInvites] = await Promise.all([
      memberRepo.count({
        where: {
          workspaceId,
          status: MemberStatus.ACTIVE,
          role: WorkspaceRole.AGENT,
        },
      }),
      inviteRepo.count({
        where: {
          workspaceId,
          status: InvitationStatus.PENDING,
          role: WorkspaceRole.AGENT,
        },
      }),
    ]);
    if (activeAgents + pendingAgentInvites >= maxAgents) {
      throw new AppException(
        {
          code: 'PLAN_LIMIT_REACHED',
          message: `The ${plan.code} plan allows ${maxAgents} agent(s) per workspace`,
          details: { limit: PLAN_LIMIT_KEYS.maxAgents, max: maxAgents },
        },
        403,
      );
    }
  }

  /**
   * `max_contacts` per workspace — the CRM contact book cap (manual create and
   * CSV import). Counts live (non-soft-deleted) contacts; the check verifies
   * room for one more. Call inside the insert's transaction, after the
   * per-workspace advisory lock, so count+insert is race-proof.
   */
  async assertCanAddContact(
    plan: Plan,
    workspaceId: string,
    em?: EntityManager,
  ): Promise<void> {
    const maxContacts = numLimit(plan, PLAN_LIMIT_KEYS.maxContacts);
    if (maxContacts === null) return;
    const repo = em ? em.getRepository(WaContact) : this.contacts;
    const contacts = await repo.count({ where: { workspaceId } });
    if (contacts >= maxContacts) {
      throw new AppException(
        {
          code: 'PLAN_LIMIT_REACHED',
          message: `The ${plan.code} plan allows ${maxContacts} contact(s) per workspace`,
          details: { limit: PLAN_LIMIT_KEYS.maxContacts, max: maxContacts },
        },
        403,
      );
    }
  }
}
