import request from 'supertest';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedWorkspaceMember } from '../helpers/members';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { WorkspaceRole } from '../../src/workspaces/entities/workspace-member.entity';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

describe('PATCH /v1/workspaces/:slug/members/:memberId/role', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;
  let workspaceId: string;
  let ownerMemberId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    ownerToken = owner.accessToken;
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      ownerToken,
      serviceKey,
    );
    slug = ws.slug;
    workspaceId = ws.id;
    const roster = asSuccess<{
      members: { memberId: string; role: WorkspaceRole }[];
    }>(
      (
        await request(ctx.app.getHttpServer())
          .get(`/v1/workspaces/${slug}/members`)
          .set('Authorization', `Bearer ${ownerToken}`)
          .expect(200)
      ).body,
    ).data;
    ownerMemberId = roster.members.find(
      (m) => m.role === WorkspaceRole.OWNER,
    )!.memberId;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const patch = (token: string, memberId: string, role: WorkspaceRole) =>
    request(ctx.app.getHttpServer())
      .patch(`/v1/workspaces/${slug}/members/${memberId}/role`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role });

  it('owner promotes a VIEWER to MANAGER', async () => {
    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    const res = await patch(
      ownerToken,
      viewer.memberId,
      WorkspaceRole.MANAGER,
    ).expect(200);
    expect(asSuccess<{ role: string }>(res.body).data.role).toBe(
      WorkspaceRole.MANAGER,
    );
  });

  it('an ADMIN cannot touch a peer ADMIN or the OWNER', async () => {
    const admin = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.ADMIN,
    );
    const admin2 = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.ADMIN,
    );
    const peer = await patch(
      admin.accessToken,
      admin2.memberId,
      WorkspaceRole.VIEWER,
    ).expect(403);
    expect(asError(peer.body).error.code).toBe('WORKSPACE_ROLE_FORBIDDEN');

    const owner = await patch(
      admin.accessToken,
      ownerMemberId,
      WorkspaceRole.MANAGER,
    ).expect(403);
    expect(asError(owner.body).error.code).toBe('CANNOT_MODIFY_OWNER');
  });

  it('rejects assigning OWNER, self-changes, and unknown members', async () => {
    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    const asOwner = await patch(
      ownerToken,
      viewer.memberId,
      WorkspaceRole.OWNER,
    ).expect(400);
    expect(asError(asOwner.body).error.code).toBe('CANNOT_ASSIGN_OWNER');

    const admin = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.ADMIN,
    );
    const self = await patch(
      admin.accessToken,
      admin.memberId,
      WorkspaceRole.MANAGER,
    ).expect(400);
    expect(asError(self.body).error.code).toBe('MEMBER_SELF_ACTION');

    const unknown = await patch(
      ownerToken,
      UNKNOWN_UUID,
      WorkspaceRole.MANAGER,
    ).expect(404);
    expect(asError(unknown.body).error.code).toBe('MEMBER_NOT_FOUND');
  });

  it('cannot promote a member to AGENT past max_agents (fresh workspace)', async () => {
    // Own workspace so the agent count is unambiguous.
    const owner2 = await registerOnboardedUser(
      ctx.app,
      ctx.app.getHttpServer(),
    );
    const ws2 = await createWorkspace(
      ctx.app.getHttpServer(),
      owner2.accessToken,
      serviceKey,
    );
    await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      ws2.id,
      WorkspaceRole.AGENT,
    ); // fills FREE max_agents=1
    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      ws2.id,
      WorkspaceRole.VIEWER,
    );
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/workspaces/${ws2.slug}/members/${viewer.memberId}/role`)
      .set('Authorization', `Bearer ${owner2.accessToken}`)
      .send({ role: WorkspaceRole.AGENT })
      .expect(403);
    expect(asError(res.body).error.details).toMatchObject({
      limit: 'max_agents',
      max: 1,
    });
  });

  it('forbids an AGENT caller (below ADMIN)', async () => {
    const agent = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.AGENT,
    );
    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    await patch(
      agent.accessToken,
      viewer.memberId,
      WorkspaceRole.MANAGER,
    ).expect(403);
  });
});
