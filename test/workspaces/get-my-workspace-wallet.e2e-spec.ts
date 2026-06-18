import request from 'supertest';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

interface BalanceView {
  balanceMicros: string;
  heldMicros: string;
  currency: string;
}

describe('GET /v1/workspaces/:slug/wallet', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;

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
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the read-only balance to a member', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/wallet`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(asSuccess<BalanceView>(res.body).data).toMatchObject({
      balanceMicros: '0',
      heldMicros: '0',
      currency: 'INR',
    });
  });

  it('404s a non-member (membership is never leaked)', async () => {
    const other = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/wallet`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('401s an unauthenticated request', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}/wallet`)
      .expect(401);
  });
});
