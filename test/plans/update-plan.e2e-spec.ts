import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { AdminPlan, createPlanViaApi, freshPlanCode } from '../helpers/plans';
import { createWorkspace, seedAvailableServiceIN } from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

describe('PATCH /v1/admin/plans/:id', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const patch = (id: string, body: Record<string, unknown>, auth = token) =>
    request(ctx.app.getHttpServer())
      .patch(`/v1/admin/plans/${id}`)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);

  it('updates fields and REPLACES entitlement records wholesale', async () => {
    await freshPlanCode(ctx.app, 'T9_PATCH');
    const plan = await createPlanViaApi(ctx.app.getHttpServer(), token, {
      code: 'T9_PATCH',
      name: 'Before',
      limits: { max_members: 5, max_agents: 1 },
    });

    const res = await patch(plan.id, {
      name: 'After',
      tier: 2,
      status: 'hidden',
      limits: { max_members: 10 },
    }).expect(200);
    const updated = asSuccess<AdminPlan>(res.body).data;
    expect(updated.name).toBe('After');
    expect(updated.tier).toBe(2);
    expect(updated.status).toBe('hidden');
    // max_agents is gone: the record is replaced, not merged.
    expect(updated.limits).toEqual({ max_members: 10 });
  });

  it('returns 404 PLAN_NOT_FOUND for an unknown id', async () => {
    const res = await patch(UNKNOWN_UUID, { name: 'Ghost' }).expect(404);
    expect(asError(res.body).error.code).toBe('PLAN_NOT_FOUND');
  });

  it('plan identity is immutable: sending code or serviceKey → 400', async () => {
    await freshPlanCode(ctx.app, 'T9_IMMUT');
    const plan = await createPlanViaApi(ctx.app.getHttpServer(), token, {
      code: 'T9_IMMUT',
      name: 'Fixed identity',
    });
    const res = await patch(plan.id, { code: 'T9_RENAMED' }).expect(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses staff below ADMIN with 403 and anonymous with 401', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await patch(UNKNOWN_UUID, { name: 'Nope' }, supportToken).expect(403);
    await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/plans/${UNKNOWN_UUID}`)
      .send({ name: 'Nope' })
      .expect(401);
  });

  it('admin edits drive LIVE enforcement: raising max_workspaces_per_service lifts the cap', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    // A service-scoped FREE row created through the admin API, cap 1.
    const plan = await createPlanViaApi(ctx.app.getHttpServer(), token, {
      code: 'FREE',
      serviceKey,
      name: 'Free (scoped)',
      limits: { max_workspaces_per_service: 1 },
    });
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'First',
    );
    const blocked = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Second' })
      .expect(403);
    expect(asError(blocked.body).error.code).toBe('PLAN_LIMIT_REACHED');

    await patch(plan.id, {
      limits: { max_workspaces_per_service: 2 },
    }).expect(200);

    // Same request again — no redeploy, no reseed: the data change is live.
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'Second',
    );
  });
});
