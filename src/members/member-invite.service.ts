import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import type { AuthContext } from '../auth-core/auth.types';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { EnvVars } from '../config/env.validation';
import { MailerService } from '../mailer/mailer.service';
import { HashService } from '../security/hash.service';
import { PasswordService } from '../security/password.service';
import { UsersService } from '../users/users.service';
import {
  MemberStatus,
  ROLE_RANK,
  WorkspaceMember,
  WorkspaceRole,
} from '../workspaces/entities/workspace-member.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { PlanLimitService } from '../workspaces/plan-limit.service';
import { ClaimInviteDto } from './dto/claim-invite.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import {
  InvitationStatus,
  WorkspaceInvitation,
} from './entities/workspace-invitation.entity';
import {
  presentInvitation,
  type ClaimResult,
  type InvitationResult,
  type InvitePreview,
} from './member-profile';

const INVITE_TTL_DAYS = 7;
const TTL_MS = INVITE_TTL_DAYS * 86_400_000;

/**
 * The invite lifecycle: invite an email (account or not), preview the link,
 * accept (existing user) or claim (brand-new user → streamlined signup), plus
 * resend/revoke. Mirrors the staff token model (sha256 + expiry). Seat
 * reservation + the per-workspace advisory lock live in the invite transaction.
 */
@Injectable()
export class MemberInviteService {
  constructor(
    @InjectRepository(WorkspaceInvitation)
    private readonly invitations: Repository<WorkspaceInvitation>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    private readonly dataSource: DataSource,
    private readonly planLimits: PlanLimitService,
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly mailer: MailerService,
    private readonly hash: HashService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly logger: AppLogger,
  ) {}

  /** ADMIN+ invites an email with a role. Reserves a seat; emails a link. */
  async invite(
    ctx: WorkspaceContext,
    actorUserId: string,
    dto: InviteMemberDto,
  ): Promise<InvitationResult> {
    const { workspace } = ctx;
    if (dto.role === WorkspaceRole.OWNER) {
      throw new AppException(
        { code: 'CANNOT_INVITE_OWNER', message: 'Cannot invite an owner' },
        409,
      );
    }
    this.assertRoleBelowActor(ctx, dto.role);
    // The guard loads the workspace WITH its plan relation; a missing plan is a
    // data integrity fault, not a normal path.
    const plan = workspace.plan;
    if (!plan) {
      throw new AppException(
        { code: 'PLAN_NOT_CONFIGURED', message: 'Workspace has no plan' },
        422,
      );
    }

    const email = dto.email.trim().toLowerCase();
    const rawToken = this.hash.randomToken(32);
    const tokenHash = this.hash.sha256(rawToken);
    const expiresAt = new Date(Date.now() + TTL_MS);

    let invitation: WorkspaceInvitation;
    try {
      invitation = await this.dataSource.transaction(async (em) => {
        await this.lockWorkspace(em, workspace.id);

        // Membership check by EMAIL, inside the lock, via `em` (one connection —
        // calling UsersService here would grab a 2nd pooled connection and
        // deadlock under concurrency). Catches a user created+joined between any
        // pre-lock read and the lock.
        const existingMember = await em
          .getRepository(WorkspaceMember)
          .createQueryBuilder('m')
          .innerJoin('m.user', 'u')
          .where('m.workspace_id = :wsId', { wsId: workspace.id })
          .andWhere('u.email = :email', { email })
          .getOne();
        if (existingMember) {
          throw new AppException(
            { code: 'ALREADY_MEMBER', message: 'Already a member' },
            409,
          );
        }

        const invRepo = em.getRepository(WorkspaceInvitation);
        const pending = await invRepo.findOne({
          where: {
            workspaceId: workspace.id,
            email,
            status: InvitationStatus.PENDING,
          },
        });
        if (pending) {
          // Re-invite: refresh token + role, no new MEMBER seat (already
          // reserved). But upgrading the role to AGENT claims an agent seat, so
          // re-check the agent cap when it changes to AGENT.
          if (
            dto.role === WorkspaceRole.AGENT &&
            pending.role !== WorkspaceRole.AGENT
          ) {
            await this.planLimits.assertAgentSeat(plan, workspace.id, em);
          }
          pending.role = dto.role;
          pending.tokenHash = tokenHash;
          pending.expiresAt = expiresAt;
          pending.invitedBy = actorUserId;
          return invRepo.save(pending);
        }

        await this.planLimits.assertCanInviteMember(
          plan,
          workspace.id,
          dto.role,
          em,
        );
        return invRepo.save(
          invRepo.create({
            workspaceId: workspace.id,
            email,
            role: dto.role,
            tokenHash,
            expiresAt,
            invitedBy: actorUserId,
            status: InvitationStatus.PENDING,
          }),
        );
      });
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new AppException(
          {
            code: 'INVITE_PENDING',
            message: 'An invite for this email is already pending',
          },
          409,
        );
      }
      throw err;
    }

    await this.sendInviteEmail(workspace, email, rawToken, actorUserId);
    this.logger.log(
      {
        event: 'workspace.member.invited',
        workspaceId: workspace.id,
        email,
        role: dto.role,
        by: actorUserId,
      },
      'Members',
    );
    return this.result(invitation, rawToken);
  }

  /** New token + reset expiry for a still-pending invite; re-emails. */
  async resend(
    ctx: WorkspaceContext,
    invitationId: string,
  ): Promise<InvitationResult> {
    const inv = await this.loadPendingById(ctx.workspace.id, invitationId);
    const rawToken = this.hash.randomToken(32);
    inv.tokenHash = this.hash.sha256(rawToken);
    inv.expiresAt = new Date(Date.now() + TTL_MS);
    const saved = await this.invitations.save(inv);
    await this.sendInviteEmail(
      ctx.workspace,
      inv.email,
      rawToken,
      ctx.membership.userId,
    );
    return this.result(saved, rawToken);
  }

  /** Revoke a pending invite (keeps history; frees the pending-unique slot). */
  async revoke(ctx: WorkspaceContext, invitationId: string): Promise<void> {
    const inv = await this.loadPendingById(ctx.workspace.id, invitationId);
    inv.status = InvitationStatus.REVOKED;
    await this.invitations.save(inv);
    this.logger.log(
      {
        event: 'workspace.member.invite_revoked',
        workspaceId: ctx.workspace.id,
        invitationId,
      },
      'Members',
    );
  }

  /** Public: what the invite link points at (login-vs-signup hint for the UI). */
  async preview(token: string): Promise<InvitePreview> {
    const inv = await this.invitations.findOne({
      where: {
        tokenHash: this.hash.sha256(token),
        status: InvitationStatus.PENDING,
      },
    });
    if (!inv) {
      throw new AppException(
        { code: 'INVITE_INVALID', message: 'Invalid or expired invite' },
        400,
      );
    }
    const [workspace, inviter, account] = await Promise.all([
      this.workspaces.findOne({ where: { id: inv.workspaceId } }),
      this.users.findById(inv.invitedBy),
      this.users.findByEmail(inv.email),
    ]);
    return {
      workspaceName: workspace?.name ?? '',
      inviterName: inviter?.fullName ?? '',
      email: inv.email,
      role: inv.role,
      accountExists: !!account,
      expired: inv.expiresAt.getTime() < Date.now(),
    };
  }

  /** Existing logged-in user accepts; one membership, no signup step. */
  async accept(
    token: string,
    caller: AuthenticatedUser,
  ): Promise<{ slug: string }> {
    const inv = await this.findValidPending(token);
    if (caller.email.toLowerCase() !== inv.email) {
      throw new AppException(
        {
          code: 'INVITE_EMAIL_MISMATCH',
          message: 'This invite was sent to a different email',
        },
        403,
      );
    }
    const slug = await this.acceptForUser(inv, caller.id);
    return { slug };
  }

  /** Brand-new email: create the account (email proven by token), join, log in. */
  async claim(
    token: string,
    dto: ClaimInviteDto,
    authCtx: AuthContext,
  ): Promise<ClaimResult> {
    const inv = await this.findValidPending(token);
    const existing = await this.users.findByEmail(inv.email);
    if (existing) {
      throw new AppException(
        {
          code: 'EMAIL_TAKEN',
          message: 'This email already has an account — log in to accept',
        },
        409,
      );
    }
    const passwordHash = await this.passwords.hash(dto.password);

    const { userId, slug } = await this.dataSource.transaction(async (em) => {
      await this.lockWorkspace(em, inv.workspaceId);
      const user = await this.users.createInvited(
        { email: inv.email, passwordHash, fullName: dto.fullName },
        em,
      );
      await this.upsertMember(em, inv, user.id);
      await this.markAccepted(em, inv, user.id);
      const ws = await em
        .getRepository(Workspace)
        .findOne({ where: { id: inv.workspaceId } });
      return { userId: user.id, slug: ws?.slug ?? '' };
    });

    const fresh = await this.users.getById(userId);
    const session = await this.auth.issueSessionFor(fresh, authCtx);
    this.logger.log(
      {
        event: 'workspace.member.claimed',
        workspaceId: inv.workspaceId,
        userId,
      },
      'Members',
    );
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
      slug,
    };
  }

  /* ------------------------------ internals ----------------------------- */

  private async acceptForUser(
    inv: WorkspaceInvitation,
    userId: string,
  ): Promise<string> {
    return this.dataSource.transaction(async (em) => {
      await this.lockWorkspace(em, inv.workspaceId);
      await this.upsertMember(em, inv, userId);
      await this.markAccepted(em, inv, userId);
      const ws = await em
        .getRepository(Workspace)
        .findOne({ where: { id: inv.workspaceId } });
      this.logger.log(
        {
          event: 'workspace.member.accepted',
          workspaceId: inv.workspaceId,
          userId,
        },
        'Members',
      );
      return ws?.slug ?? '';
    });
  }

  /** Create the member row, or restore+update a soft-deleted one (re-join). */
  private async upsertMember(
    em: EntityManager,
    inv: WorkspaceInvitation,
    userId: string,
  ): Promise<void> {
    const repo = em.getRepository(WorkspaceMember);
    const existing = await repo.findOne({
      where: { workspaceId: inv.workspaceId, userId },
      withDeleted: true,
    });
    if (existing && !existing.deletedAt) return; // already an active member
    if (existing) {
      await repo.recover(existing);
    }
    const row =
      existing ?? repo.create({ workspaceId: inv.workspaceId, userId });
    row.role = inv.role;
    row.status = MemberStatus.ACTIVE;
    row.invitedBy = inv.invitedBy;
    row.joinedAt = new Date();
    await repo.save(row);
  }

  private async markAccepted(
    em: EntityManager,
    inv: WorkspaceInvitation,
    userId: string,
  ): Promise<void> {
    inv.status = InvitationStatus.ACCEPTED;
    inv.acceptedUserId = userId;
    inv.acceptedAt = new Date();
    await em.getRepository(WorkspaceInvitation).save(inv);
  }

  private async findValidPending(token: string): Promise<WorkspaceInvitation> {
    const inv = await this.invitations.findOne({
      where: {
        tokenHash: this.hash.sha256(token),
        status: InvitationStatus.PENDING,
      },
    });
    if (!inv || inv.expiresAt.getTime() < Date.now()) {
      throw new AppException(
        { code: 'INVITE_INVALID', message: 'Invalid or expired invite' },
        400,
      );
    }
    return inv;
  }

  private async loadPendingById(
    workspaceId: string,
    invitationId: string,
  ): Promise<WorkspaceInvitation> {
    const inv = await this.invitations.findOne({
      where: {
        id: invitationId,
        workspaceId,
        status: InvitationStatus.PENDING,
      },
    });
    if (!inv) {
      throw new AppException(
        { code: 'INVITE_NOT_FOUND', message: 'Pending invite not found' },
        404,
      );
    }
    return inv;
  }

  private async sendInviteEmail(
    workspace: Workspace,
    email: string,
    rawToken: string,
    inviterUserId: string,
  ): Promise<void> {
    const inviter = await this.users.findById(inviterUserId);
    await this.mailer.sendWorkspaceInvite(
      email,
      rawToken,
      workspace.name,
      inviter?.fullName ?? 'A teammate',
    );
  }

  private lockWorkspace(
    em: EntityManager,
    workspaceId: string,
  ): Promise<unknown> {
    return em.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `member-invite:${workspaceId}`,
    ]);
  }

  private assertRoleBelowActor(
    ctx: WorkspaceContext,
    role: WorkspaceRole,
  ): void {
    if (ROLE_RANK[role] >= ROLE_RANK[ctx.membership.role]) {
      throw new AppException(
        {
          code: 'WORKSPACE_ROLE_FORBIDDEN',
          message: 'You can only invite roles below your own',
        },
        403,
      );
    }
  }

  private result(
    invitation: WorkspaceInvitation,
    rawToken: string,
  ): InvitationResult {
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      invitation: presentInvitation(invitation),
      ...(isProd ? {} : { inviteToken: rawToken }),
    };
  }
}
