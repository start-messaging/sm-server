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

interface Roster {
  members: { role: string; email: string }[];
  invitations: { email: string; role: string }[];
}

describe('GET /v1/workspaces/:slug/members', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;
  let workspaceId: string;

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
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns active members (owner-first) plus pending invitations', async () => {
    await inviteMember(ctx.app.getHttpServer(), ownerToken, slug, {
      email: uniqueEmail('pending'),
      role: WorkspaceRole.VIEWER,
    });
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const roster = asSuccess<Roster>(res.body).data;
    expect(roster.members[0]?.role).toBe(WorkspaceRole.OWNER);
    expect(roster.invitations).toHaveLength(1);
    expect(roster.invitations[0]?.role).toBe(WorkspaceRole.VIEWER);
  });

  it('lets any active member (VIEWER) read the roster', async () => {
    const viewer = await seedWorkspaceMember(
      ctx.app,
      ctx.app.getHttpServer(),
      workspaceId,
      WorkspaceRole.VIEWER,
    );
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/members`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);
  });

  it('404s a non-member', async () => {
    const stranger = await registerOnboardedUser(
      ctx.app,
      ctx.app.getHttpServer(),
    );
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/members`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });
});
