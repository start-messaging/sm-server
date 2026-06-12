import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { AdminPlan, createPlanViaApi, freshPlanCode } from '../helpers/plans';
import { seedService } from '../helpers/reference';

describe('GET /v1/admin/plans', () => {
  let ctx: TestAppContext;
  let adminToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    adminToken = await loginStaff(ctx.app.getHttpServer(), admin.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lets ANY staff list plans; global fallbacks come before service-scoped rows', async () => {
    const serviceKey = await seedService(ctx.app);
    await freshPlanCode(ctx.app, 'T9_ORDER');
    await createPlanViaApi(ctx.app.getHttpServer(), adminToken, {
      code: 'T9_ORDER',
      name: 'Global row',
    });
    await createPlanViaApi(ctx.app.getHttpServer(), adminToken, {
      code: 'T9_ORDER',
      serviceKey,
      name: 'Scoped row',
    });

    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/plans')
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
    const plans = asSuccess<AdminPlan[]>(res.body).data;

    const globalIdx = plans.findIndex(
      (p) => p.code === 'T9_ORDER' && p.serviceKey === null,
    );
    const scopedIdx = plans.findIndex(
      (p) => p.code === 'T9_ORDER' && p.serviceKey === serviceKey,
    );
    expect(globalIdx).toBeGreaterThanOrEqual(0);
    expect(scopedIdx).toBeGreaterThanOrEqual(0);

    // NULLS FIRST ordering: every global row precedes every scoped row.
    const lastGlobal = plans.reduce(
      (acc, p, i) => (p.serviceKey === null ? i : acc),
      -1,
    );
    const firstScoped = plans.findIndex((p) => p.serviceKey !== null);
    expect(lastGlobal).toBeLessThan(firstScoped);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/admin/plans').expect(401);
  });
});
