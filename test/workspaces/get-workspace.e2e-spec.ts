import request from 'supertest';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  CreatedWorkspace,
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

describe('GET /v1/workspaces/:slug', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the workspace (with role + timezone) to a member', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'Lookup Co',
    );

    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const body = asSuccess<
      CreatedWorkspace & {
        timezone: string | null;
        planFeatures: Record<string, boolean | string>;
        planLimits: Record<string, number | null>;
      }
    >(res.body).data;
    expect(body.id).toBe(ws.id);
    expect(body.serviceKey).toBe(serviceKey);
    expect(body.role).toBe('OWNER');
    expect(body.timezone).toBeNull();
    // Entitlements flow to the client as open key-value sets for UI gating.
    expect(body.planLimits.max_workspaces_per_service).toBe(1);
    expect(typeof body.planFeatures).toBe('object');
  });

  it("hides ANOTHER user's workspace behind the same 404", async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const stranger = await registerOnboardedUser(
      ctx.app,
      ctx.app.getHttpServer(),
    );
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      owner.accessToken,
      serviceKey,
    );

    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${ws.slug}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('returns 404 WORKSPACE_NOT_FOUND for an unknown slug', async () => {
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/workspaces/totally-unknown-slug')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/workspaces/any-slug')
      .expect(401);
  });
});
