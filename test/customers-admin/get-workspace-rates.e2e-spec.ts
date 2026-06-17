import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshServiceKey,
  seedCategory,
  seedCountry,
  seedRate,
  seedService,
} from '../helpers/reference';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
  seedLadder,
} from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface RatesView {
  workspace: { id: string; countryCode: string };
  service: { key: string; categories: { key: string }[] };
  countries: {
    countryCode: string;
    isHome: boolean;
    cells: {
      categoryKey: string;
      base: {
        providerCostMicros: number | null;
        sellMicros: number | null;
      } | null;
      ladder: { minQty: number; sellMicros: number }[];
    }[];
  }[];
}

describe('GET /v1/admin/workspaces/:id/services/:serviceKey/rates', () => {
  let ctx: TestAppContext;
  let token: string;
  let serviceKey: string;
  let wsId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    // Reads = any staff.
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    token = await loginStaff(ctx.app.getHttpServer(), support.email);

    serviceKey = await seedAvailableServiceIN(ctx.app);
    // The IN rate row references the 'default' category — give the service the
    // matching category row (the view skips categories the service lacks).
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

  const get = (ws: string, key: string) =>
    request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${ws}/services/${key}/rates`)
      .set('Authorization', `Bearer ${token}`);

  it('returns base rates with an empty ladder, home country first', async () => {
    const view = asSuccess<RatesView>(
      (await get(wsId, serviceKey).expect(200)).body,
    ).data;
    expect(view.workspace).toMatchObject({ id: wsId, countryCode: 'IN' });
    expect(view.service.key).toBe(serviceKey);
    expect(view.service.categories.map((c) => c.key)).toContain('default');

    expect(view.countries[0]).toMatchObject({
      countryCode: 'IN',
      isHome: true,
    });
    const cell = view.countries[0]?.cells.find(
      (c) => c.categoryKey === 'default',
    );
    expect(cell?.base).toMatchObject({
      providerCostMicros: 50000,
      sellMicros: 100000,
    });
    expect(cell?.ladder).toEqual([]);
  });

  it('returns the ladder sorted by minQty', async () => {
    await seedLadder(ctx.app, {
      workspaceId: wsId,
      serviceKey,
      countryCode: 'IN',
      categoryKey: 'default',
      currency: 'INR',
      // Deliberately unordered — the view must sort.
      rungs: [
        { minQty: 10000, sellMicros: 80000 },
        { minQty: 0, sellMicros: 90000 },
      ],
    });
    const view = asSuccess<RatesView>(
      (await get(wsId, serviceKey).expect(200)).body,
    ).data;
    const cell = view.countries[0]?.cells.find(
      (c) => c.categoryKey === 'default',
    );
    expect(cell?.ladder).toEqual([
      { minQty: 0, sellMicros: 90000 },
      { minQty: 10000, sellMicros: 80000 },
    ]);
  });

  it('includes other base-priced countries with an empty ladder', async () => {
    const otherCC = await seedCountry(ctx.app);
    await seedRate(ctx.app, {
      serviceKey,
      countryCode: otherCC,
      categoryKey: 'default',
      currency: 'INR', // seedRate is repo-direct; currency row must exist
      sellMicros: 200000,
      providerCostMicros: 90000,
    });
    const view = asSuccess<RatesView>(
      (await get(wsId, serviceKey).expect(200)).body,
    ).data;
    const other = view.countries.find((c) => c.countryCode === otherCC);
    expect(other).toBeDefined();
    expect(other?.isHome).toBe(false);
    const cell = other?.cells.find((c) => c.categoryKey === 'default');
    expect(cell?.base?.sellMicros).toBe(200000);
    expect(cell?.ladder).toEqual([]);
    // Home country still leads the list.
    expect(view.countries[0]?.countryCode).toBe('IN');
  });

  it('404s: unknown workspace, unknown service, not-enrolled service', async () => {
    const unknownWs = await get(UNKNOWN_UUID, serviceKey).expect(404);
    expect(asError(unknownWs.body).error.code).toBe('WORKSPACE_NOT_FOUND');

    const ghostKey = await freshServiceKey(ctx.app);
    const unknownSvc = await get(wsId, ghostKey).expect(404);
    expect(asError(unknownSvc.body).error.code).toBe('SERVICE_NOT_FOUND');

    const otherService = await seedService(ctx.app);
    const notEnrolled = await get(wsId, otherService).expect(404);
    expect(asError(notEnrolled.body).error.code).toBe(
      'WORKSPACE_SERVICE_NOT_FOUND',
    );
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${UNKNOWN_UUID}/services/x/rates`)
      .expect(401);
  });
});
