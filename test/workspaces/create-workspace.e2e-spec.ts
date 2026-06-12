import request from 'supertest';
import { ServiceStatus } from '../../src/services/entities/service.entity';
import {
  DEFAULT_PASSWORD,
  ensureCountryIN,
  registerOnboardedUser,
  registerVerifiedUser,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedRate, seedService } from '../helpers/reference';
import {
  CreatedWorkspace,
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
  seedPlan,
} from '../helpers/workspaces';

describe('POST /v1/services/:serviceKey/workspaces', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a FREE workspace with OWNER membership and a slugified slug', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Acme Traders & Sons' })
      .expect(201);

    const ws = asSuccess<CreatedWorkspace>(res.body).data;
    expect(ws.slug).toBe('acme-traders-sons');
    expect(ws.serviceKey).toBe(serviceKey);
    expect(ws.role).toBe('OWNER');
    expect(ws.planCode).toBe('FREE');
    expect(ws.countryCode).toBe('IN');
    expect(ws.defaultCurrency).toBe('INR');
    expect(ws.status).toBe('active');
  });

  it('resolves duplicate names to distinct slugs', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const a = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const b = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const first = await createWorkspace(
      ctx.app.getHttpServer(),
      a.accessToken,
      serviceKey,
      'Same Name Co',
    );
    const second = await createWorkspace(
      ctx.app.getHttpServer(),
      b.accessToken,
      serviceKey,
      'Same Name Co',
    );
    expect(first.slug).toBe('same-name-co');
    expect(second.slug).not.toBe(first.slug);
    expect(second.slug).toMatch(/^same-name-co-/);
  });

  it('enforces the FREE cap: second workspace on the SAME service → 403 PLAN_LIMIT_REACHED', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Second Try' })
      .expect(403);
    const err = asError(res.body).error;
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(err.details).toEqual({
      limit: 'max_workspaces_per_service',
      max: 1,
    });
  });

  it('the cap is DATA: a service-scoped plan row with a higher limit wins over the global FREE', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    await seedPlan(ctx.app, {
      serviceKey,
      code: 'FREE',
      limits: { max_workspaces_per_service: 2 },
    });
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'First',
    );
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'Second',
    );

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Third' })
      .expect(403);
    const err = asError(res.body).error;
    expect(err.code).toBe('PLAN_LIMIT_REACHED');
    expect(err.details).toEqual({
      limit: 'max_workspaces_per_service',
      max: 2,
    });
  });

  it('a plan with NO max_workspaces_per_service key is unlimited', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    await seedPlan(ctx.app, { serviceKey, code: 'FREE', limits: {} });
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'One',
    );
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'Two',
    );
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
      'Three',
    );
  });

  it('allows the same user a FREE workspace on a DIFFERENT service', async () => {
    const serviceA = await seedAvailableServiceIN(ctx.app);
    const serviceB = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    await createWorkspace(ctx.app.getHttpServer(), user.accessToken, serviceA);
    const second = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceB,
      'Second Service WS',
    );
    expect(second.serviceKey).toBe(serviceB);
  });

  it('rejects a service with no active rate in the user country → 400 SERVICE_NOT_AVAILABLE', async () => {
    // seedService starts the key clean (deletes first) — no rate rows exist.
    const unpriced = await seedService(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${unpriced}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'No Rates Here' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_AVAILABLE');
  });

  it('a coming_soon service is a visible TEASER but never creatable → 400 SERVICE_NOT_AVAILABLE', async () => {
    await ensureCountryIN(ctx.app);
    // Even priced in the user's country, coming_soon wins: shown, not sellable.
    const teaser = await seedService(ctx.app, {
      status: ServiceStatus.COMING_SOON,
    });
    await seedRate(ctx.app, {
      serviceKey: teaser,
      countryCode: 'IN',
      categoryKey: 'default',
      currency: 'INR',
      sellMicros: 100000,
      providerCostMicros: 50000,
    });
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const listed = await request(ctx.app.getHttpServer())
      .get('/v1/services')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const teaserRow = asSuccess<{ key: string; status: string }[]>(
      listed.body,
    ).data.find((s) => s.key === teaser);
    expect(teaserRow?.status).toBe('coming_soon');

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${teaser}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Too Eager' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_AVAILABLE');
  });

  it('rejects an email-only user (no verified mobile) → 403 COUNTRY_NOT_SET', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'Too Early' })
      .expect(403);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_SET');
  });

  it('rejects a too-short name with 400 VALIDATION_ERROR', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ name: 'x' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/services/whatever/workspaces')
      .send({ name: 'Nope' })
      .expect(401);
  });

  it('CONCURRENT creates cannot bypass the FREE cap (advisory-lock serialized)', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const statuses = await Promise.all(
      [1, 2, 3].map((i) =>
        request(ctx.app.getHttpServer())
          .post(`/v1/services/${serviceKey}/workspaces`)
          .set('Authorization', `Bearer ${user.accessToken}`)
          .send({ name: `Race Attempt ${i}` })
          .then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 403)).toHaveLength(2);
  });

  it('the cap follows the USER across sessions, not the token', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );

    const login = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_PASSWORD })
      .expect(200);
    const fresh = asSuccess<{ accessToken: string }>(login.body).data;

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/services/${serviceKey}/workspaces`)
      .set('Authorization', `Bearer ${fresh.accessToken}`)
      .send({ name: 'Round Two' })
      .expect(403);
    expect(asError(res.body).error.code).toBe('PLAN_LIMIT_REACHED');
  });
});
