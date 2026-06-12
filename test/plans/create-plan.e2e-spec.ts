import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { AdminPlan, freshPlanCode } from '../helpers/plans';
import { seedService } from '../helpers/reference';

describe('POST /v1/admin/plans', () => {
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

  const post = (body: Record<string, unknown>, auth = token) =>
    request(ctx.app.getHttpServer())
      .post('/v1/admin/plans')
      .set('Authorization', `Bearer ${auth}`)
      .send(body);

  it('creates a GLOBAL plan with a normalised code and safe defaults', async () => {
    await freshPlanCode(ctx.app, 'T9_GLOBAL');
    const res = await post({ code: 't9_global ', name: 'Test Global' }).expect(
      201,
    );
    const plan = asSuccess<AdminPlan>(res.body).data;
    expect(plan.code).toBe('T9_GLOBAL');
    expect(plan.serviceKey).toBeNull();
    expect(plan.tier).toBe(0);
    expect(plan.trialDays).toBe(0);
    expect(plan.status).toBe('active');
    expect(plan.features).toEqual({});
    expect(plan.limits).toEqual({});
  });

  it('rejects a duplicate global code with 409 PLAN_EXISTS', async () => {
    await freshPlanCode(ctx.app, 'T9_DUP');
    await post({ code: 'T9_DUP', name: 'First' }).expect(201);
    const res = await post({ code: 'T9_DUP', name: 'Second' }).expect(409);
    expect(asError(res.body).error.code).toBe('PLAN_EXISTS');
  });

  it('scopes a plan to a service; the same code may exist globally AND per service', async () => {
    const serviceKey = await seedService(ctx.app);
    await freshPlanCode(ctx.app, 'T9_SCOPED');
    await post({ code: 'T9_SCOPED', name: 'Global twin' }).expect(201);

    const res = await post({
      code: 'T9_SCOPED',
      serviceKey,
      name: 'Scoped',
      tier: 1,
      features: { wa_campaigns: true, support_level: 'priority' },
      limits: { max_members: 5, max_contacts: null },
    }).expect(201);
    const plan = asSuccess<AdminPlan>(res.body).data;
    expect(plan.serviceKey).toBe(serviceKey);
    expect(plan.features).toEqual({
      wa_campaigns: true,
      support_level: 'priority',
    });
    expect(plan.limits).toEqual({ max_members: 5, max_contacts: null });

    const dup = await post({
      code: 'T9_SCOPED',
      serviceKey,
      name: 'Scoped again',
    }).expect(409);
    expect(asError(dup.body).error.code).toBe('PLAN_EXISTS');
  });

  it('rejects an unknown serviceKey with 404 SERVICE_NOT_FOUND', async () => {
    await freshPlanCode(ctx.app, 'T9_NOSVC');
    const res = await post({
      code: 'T9_NOSVC',
      serviceKey: 'no-such-service',
      name: 'Orphan',
    }).expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('rejects malformed entitlement records with 400 VALIDATION_ERROR', async () => {
    await freshPlanCode(ctx.app, 'T9_BADREC');
    const cases: Record<string, unknown>[] = [
      { features: { wa_campaigns: 1 } }, // number is not a feature value
      { limits: { max_members: 'five' } }, // string is not a limit value
      { limits: { max_members: -1 } }, // negative
      { limits: { max_members: 1.5 } }, // fractional
      { features: { BadKey: true } }, // not snake_case
      { features: ['wa_campaigns'] }, // not an object
    ];
    for (const broken of cases) {
      const res = await post({
        code: 'T9_BADREC',
        name: 'Broken',
        ...broken,
      }).expect(400);
      expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('refuses staff below ADMIN with 403', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await post({ code: 'T9_ROLE', name: 'Nope' }, supportToken).expect(403);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/admin/plans')
      .send({ code: 'T9_ANON', name: 'Nope' })
      .expect(401);
  });
});
