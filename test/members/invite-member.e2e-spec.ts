import request from 'supertest';
import { registerOnboardedUser, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { inviteMember, seedWorkspaceMember } from '../helpers/members';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { WorkspaceRole } from '../../src/workspaces/entities/workspace-member.entity';

describe('POST /v1/workspaces/:slug/members/invitations', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;
  let workspaceId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  // A clean workspace per test so member/agent seat counts never bleed across.
  beforeEach(async () => {
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    ownerToken = owner.accessToken;
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      ownerToken,
      serviceKey,
    );
    slug = ws.slug;
    workspaceId = ws.id;
  });

  const invite = (token: string, body: { email: string; role: string }) =>
    request(ctx.app.getHttpServer())
      .post(`/v1/workspaces/${slug}/members/invitations`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('owner invites members of every (non-owner) role', async () => {
    for (const role of [
      WorkspaceRole.ADMIN,
      WorkspaceRole.MANAGER,
      WorkspaceRole.VIEWER,
    ]) {
      const res = await invite(ownerToken, {
        email: uniqueEmail('invitee'),
        role,
      }).expect(201);
      const data = asSuccess<{
        invitation: { role: string; email: string };
        inviteToken?: string;
      }>(res.body).data;
      expect(data.invitation.role).toBe(role);
      expect(data.inviteToken).toBeTruthy(); // dev token returned outside prod
    }
  });

  it('rejects role=OWNER (409) and a role >= the actor', async () => {
    const owner = await invite(ownerToken, {
      email: uniqueEmail('o'),
      role: WorkspaceRole.OWNER,
    }).expect(409);
    expect(asError(owner.body).error.code).toBe('CANNOT_INVITE_OWNER');

    // A MANAGER cannot invite an ADMIN (>= their own rank).
    const manager = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.MANAGER,
    );
    const res = await invite(manager.accessToken, {
      email: uniqueEmail('a'),
      role: WorkspaceRole.ADMIN,
    }).expect(403);
    expect(asError(res.body).error.code).toBe('WORKSPACE_ROLE_FORBIDDEN');
  });

  it('forbids AGENT/VIEWER callers and non-members', async () => {
    const agent = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.AGENT,
    );
    await invite(agent.accessToken, {
      email: uniqueEmail('x'),
      role: WorkspaceRole.VIEWER,
    }).expect(403);

    const stranger = await registerOnboardedUser(
      ctx.app,
      ctx.app.getHttpServer(),
    );
    const res = await invite(stranger.accessToken, {
      email: uniqueEmail('y'),
      role: WorkspaceRole.VIEWER,
    }).expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('409s inviting someone who is already an active member', async () => {
    const member = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    const res = await invite(ownerToken, {
      email: member.email,
      role: WorkspaceRole.MANAGER,
    }).expect(409);
    expect(asError(res.body).error.code).toBe('ALREADY_MEMBER');
  });

  it('refreshes (does not duplicate) a pending invite for the same email', async () => {
    const email = uniqueEmail('dup');
    const first = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      {
        email,
        role: WorkspaceRole.VIEWER,
      },
    );
    const second = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email, role: WorkspaceRole.MANAGER },
    );
    expect(second.invitation.invitationId).toBe(first.invitation.invitationId);
    expect(second.invitation.role).toBe(WorkspaceRole.MANAGER);
  });

  it('enforces max_members (FREE=5) counting active + pending (reserved seats)', async () => {
    // owner is 1 active; 4 pending VIEWER invites fill the cap.
    for (let i = 0; i < 4; i++) {
      await invite(ownerToken, {
        email: uniqueEmail(`m${i}`),
        role: WorkspaceRole.VIEWER,
      }).expect(201);
    }
    const over = await invite(ownerToken, {
      email: uniqueEmail('over'),
      role: WorkspaceRole.VIEWER,
    }).expect(403);
    const err = asError(over.body).error;
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(err.details).toMatchObject({ limit: 'max_members', max: 5 });
  });

  it('enforces max_agents (FREE=1)', async () => {
    await invite(ownerToken, {
      email: uniqueEmail('agent1'),
      role: WorkspaceRole.AGENT,
    }).expect(201);
    const second = await invite(ownerToken, {
      email: uniqueEmail('agent2'),
      role: WorkspaceRole.AGENT,
    }).expect(403);
    expect(asError(second.body).error.details).toMatchObject({
      limit: 'max_agents',
      max: 1,
    });
  });

  it('re-inviting a pending VIEWER as AGENT still respects max_agents', async () => {
    await invite(ownerToken, {
      email: uniqueEmail('agent'),
      role: WorkspaceRole.AGENT,
    }).expect(201); // fills max_agents=1
    const email = uniqueEmail('promote');
    await invite(ownerToken, { email, role: WorkspaceRole.VIEWER }).expect(201);
    const res = await invite(ownerToken, {
      email,
      role: WorkspaceRole.AGENT,
    }).expect(403);
    expect(asError(res.body).error.details).toMatchObject({
      limit: 'max_agents',
      max: 1,
    });
  });

  it('serialises concurrent invites at the cap — exactly the free seats win', async () => {
    // owner=1 active, max_members=5 → 4 seats. Fire 8 at once.
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        invite(ownerToken, {
          email: uniqueEmail(`race${i}`),
          role: WorkspaceRole.VIEWER,
        }),
      ),
    );
    const created = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 201,
    ).length;
    expect(created).toBe(4);
  });
});
