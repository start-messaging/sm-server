import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { RateResolverService } from '../../src/pricing/rate-resolver.service';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedCategory, seedCountry, seedRate } from '../helpers/reference';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
  seedLadder,
} from '../helpers/workspaces';

interface Resolved {
  sellMicros: number;
  costMicros: number | null;
  currency: string;
  tier: 1 | 2;
  minQty: number | null;
}

/**
 * Two-tier resolution (docs §11): workspace ladder rung → country base, no
 * global/plan tier. The admin resolve-preview exercises the RULES; the resolver
 * service is also driven directly to prove the version-stamped cache.
 */
describe('Rate resolution', () => {
  let ctx: TestAppContext;
  let token: string;
  let adminToken: string;
  let serviceKey: string;
  let wsId: string;

  const resolve = (cc: string, cat: string, qty: number) =>
    request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/services/${serviceKey}/resolve`)
      .query({ country: cc, category: cat, qty })
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    token = await loginStaff(ctx.app.getHttpServer(), support.email);
    const admin = await createStaff(ctx.app, PlatformRole.ADMIN);
    adminToken = await loginStaff(ctx.app.getHttpServer(), admin.email);

    // IN/default base = sell 100000 / cost 50000 (from the helper).
    serviceKey = await seedAvailableServiceIN(ctx.app);
    await seedCategory(ctx.app, serviceKey, {
      key: 'default',
      label: 'Default',
    });
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );
    wsId = ws.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('resolves the country base when there is no override (tier 2)', async () => {
    const r = asSuccess<Resolved>(
      (await resolve('IN', 'default', 0).expect(200)).body,
    ).data;
    expect(r).toMatchObject({
      sellMicros: 100000,
      costMicros: 50000,
      currency: 'INR',
      tier: 2,
      minQty: null,
    });
  });

  it('picks the workspace ladder rung for the volume (tier 1)', async () => {
    await seedLadder(ctx.app, {
      workspaceId: wsId,
      serviceKey,
      countryCode: 'IN',
      categoryKey: 'default',
      currency: 'INR',
      rungs: [
        { minQty: 0, sellMicros: 90000 },
        { minQty: 10000, sellMicros: 80000 },
      ],
    });

    const low = asSuccess<Resolved>(
      (await resolve('IN', 'default', 0).expect(200)).body,
    ).data;
    expect(low).toMatchObject({ sellMicros: 90000, tier: 1, minQty: 0 });

    const mid = asSuccess<Resolved>(
      (await resolve('IN', 'default', 5000).expect(200)).body,
    ).data;
    expect(mid).toMatchObject({ sellMicros: 90000, tier: 1, minQty: 0 });

    const high = asSuccess<Resolved>(
      (await resolve('IN', 'default', 10000).expect(200)).body,
    ).data;
    expect(high).toMatchObject({ sellMicros: 80000, tier: 1, minQty: 10000 });
    // Cost still comes from the country base, never the rung.
    expect(high.costMicros).toBe(50000);
  });

  it('422s when the country base is missing or inactive', async () => {
    // An unpriced country (no base row at all) → hard error, never a free send.
    const unpriced = await seedCountry(ctx.app);
    const missing = await resolve(unpriced, 'default', 0).expect(422);
    expect(asError(missing.body).error.code).toBe('RATE_NOT_CONFIGURED');

    // A priced-but-inactive base blocks too (no fall-through below tier 2).
    const blocked = await seedCountry(ctx.app);
    await seedRate(ctx.app, {
      serviceKey,
      countryCode: blocked,
      categoryKey: 'default',
      currency: 'INR',
      sellMicros: 200000,
      providerCostMicros: 90000,
      isActive: false,
    });
    const inactive = await resolve(blocked, 'default', 0).expect(422);
    expect(asError(inactive.body).error.code).toBe('RATE_NOT_CONFIGURED');
  });

  it('the cached resolver reflects a ladder write (version invalidation)', async () => {
    // A pristine cell (own category) so this test owns its cache version.
    await seedCategory(ctx.app, serviceKey, { key: 'promo', label: 'Promo' });
    await seedRate(ctx.app, {
      serviceKey,
      countryCode: 'IN',
      categoryKey: 'promo',
      currency: 'INR',
      sellMicros: 120000,
      providerCostMicros: 60000,
    });
    const resolver = ctx.app.get(RateResolverService);
    const query = {
      workspaceId: wsId,
      serviceKey,
      countryCode: 'IN',
      categoryKey: 'promo',
      qty: 0,
    };

    // First (cached) read = country base.
    const before = await resolver.resolve(query);
    expect(before).toMatchObject({ sellMicros: 120000, tier: 2 });

    // A ladder PUT bumps the version → the next read must see the override.
    await request(ctx.app.getHttpServer())
      .put(`/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates/IN/promo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'INR', rungs: [{ minQty: 0, sellMicros: 70000 }] })
      .expect(200);

    const after = await resolver.resolve(query);
    expect(after).toMatchObject({ sellMicros: 70000, tier: 1, minQty: 0 });
  });
});
