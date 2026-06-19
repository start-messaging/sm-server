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

describe('DELETE /v1/workspaces/:slug/members/:memberId', () => {
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

  const del = (token: string, memberId: string) =>
    request(ctx.app.getHttpServer())
      .delete(`/v1/workspaces/${slug}/members/${memberId}`)
      .set('Authorization', `Bearer ${token}`);

  it('owner removes a member; the removed user loses workspace access', async () => {
    const manager = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.MANAGER,
    );
    // The member can reach the workspace before removal...
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .expect(200);

    await del(ownerToken, manager.memberId).expect(204);

    // ...and 404s after (membership is gone).
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .expect(404);
  });

  it('cannot remove the OWNER, yourself, and forbids low-rank callers', async () => {
    const admin = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.ADMIN,
    );
    const ownerAttempt = await del(admin.accessToken, ownerMemberId).expect(
      403,
    );
    expect(asError(ownerAttempt.body).error.code).toBe('CANNOT_MODIFY_OWNER');

    const self = await del(admin.accessToken, admin.memberId).expect(400);
    expect(asError(self.body).error.code).toBe('MEMBER_SELF_ACTION');

    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    await del(viewer.accessToken, admin.memberId).expect(403);
  });
});
