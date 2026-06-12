import request from 'supertest';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import {
  CreatedWorkspace,
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

describe('GET /v1/workspaces', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns ONLY the caller workspaces, with service and role', async () => {
    const serviceA = await seedAvailableServiceIN(ctx.app);
    const serviceB = await seedAvailableServiceIN(ctx.app);
    const me = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const other = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const mineA = await createWorkspace(
      ctx.app.getHttpServer(),
      me.accessToken,
      serviceA,
      'Mine A',
    );
    const mineB = await createWorkspace(
      ctx.app.getHttpServer(),
      me.accessToken,
      serviceB,
      'Mine B',
    );
    await createWorkspace(
      ctx.app.getHttpServer(),
      other.accessToken,
      serviceA,
      'Not Mine',
    );

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/workspaces')
      .set('Authorization', `Bearer ${me.accessToken}`)
      .expect(200);
    const list = asSuccess<CreatedWorkspace[]>(res.body).data;

    expect(list).toHaveLength(2);
    expect(list.map((w) => w.id).sort()).toEqual([mineA.id, mineB.id].sort());
    const a = list.find((w) => w.id === mineA.id)!;
    expect(a.serviceKey).toBe(serviceA);
    expect(a.role).toBe('OWNER');
    expect(a.planCode).toBe('FREE');
    expect(a.slug).toBe(mineA.slug);
  });

  it('returns an empty list for a fresh user', async () => {
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/workspaces')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(asSuccess<CreatedWorkspace[]>(res.body).data).toEqual([]);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/workspaces').expect(401);
  });
});
