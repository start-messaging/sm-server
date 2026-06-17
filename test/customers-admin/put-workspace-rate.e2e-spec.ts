import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshCountryCode,
  seedCategory,
  seedService,
} from '../helpers/reference';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface LadderCell {
  countryCode: string;
  categoryKey: string;
  currency: string;
  rungs: { minQty: number; sellMicros: number }[];
}

describe('PUT /v1/admin/workspaces/:id/services/:key/rates/:cc/:cat', () => {
  let ctx: TestAppContext;
  let token: string;
  let serviceKey: string;
  let wsId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    const admin = await createStaff(ctx.app, PlatformRole.ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);

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

  const put = (
    body: Record<string, unknown>,
    {
      ws = wsId,
      key = serviceKey,
      cc = 'IN',
      cat = 'default',
      auth = token,
    } = {},
  ) =>
    request(ctx.app.getHttpServer())
      .put(`/v1/admin/workspaces/${ws}/services/${key}/rates/${cc}/${cat}`)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);

  const getLadder = async (): Promise<
    { minQty: number; sellMicros: number }[]
  > => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const view = asSuccess<{
      countries: {
        countryCode: string;
        cells: {
          categoryKey: string;
          ladder: { minQty: number; sellMicros: number }[];
        }[];
      }[];
    }>(res.body).data;
    return (
      view.countries
        .find((c) => c.countryCode === 'IN')
        ?.cells.find((c) => c.categoryKey === 'default')?.ladder ?? []
    );
  };

  it('a single minQty-0 rung IS a flat negotiated rate', async () => {
    const res = await put({
      currency: 'INR',
      rungs: [{ minQty: 0, sellMicros: 90000 }],
    }).expect(200);
    const cell = asSuccess<LadderCell>(res.body).data;
    expect(cell).toMatchObject({
      countryCode: 'IN',
      categoryKey: 'default',
      currency: 'INR',
      rungs: [{ minQty: 0, sellMicros: 90000 }],
    });
  });

  it('replaces the ladder WHOLESALE (no merge)', async () => {
    await put({
      currency: 'INR',
      rungs: [
        { minQty: 0, sellMicros: 90000 },
        { minQty: 10000, sellMicros: 80000 },
        { minQty: 50000, sellMicros: 70000 },
      ],
    }).expect(200);
    expect(await getLadder()).toHaveLength(3);

    await put({
      currency: 'INR',
      rungs: [{ minQty: 0, sellMicros: 85000 }],
    }).expect(200);
    // The 3 old rungs are gone — replaced, not merged.
    expect(await getLadder()).toEqual([{ minQty: 0, sellMicros: 85000 }]);
  });

  it('rejects invalid rung sets with 400', async () => {
    // Empty set.
    await put({ currency: 'INR', rungs: [] }).expect(400);

    // First rung must start at 0 — the message says so.
    const nonZero = await put({
      currency: 'INR',
      rungs: [{ minQty: 1000, sellMicros: 90000 }],
    }).expect(400);
    expect(JSON.stringify(asError(nonZero.body))).toContain('minQty 0');

    // Duplicate minQty.
    await put({
      currency: 'INR',
      rungs: [
        { minQty: 0, sellMicros: 90000 },
        { minQty: 0, sellMicros: 80000 },
      ],
    }).expect(400);

    // Too many rungs (11 > 10).
    await put({
      currency: 'INR',
      rungs: Array.from({ length: 11 }, (_, i) => ({
        minQty: i * 1000,
        sellMicros: 90000,
      })),
    }).expect(400);

    // Negative / missing sellMicros.
    await put({
      currency: 'INR',
      rungs: [{ minQty: 0, sellMicros: -1 }],
    }).expect(400);
    await put({ currency: 'INR', rungs: [{ minQty: 0 }] }).expect(400);
  });

  it('rejects an unknown category with 400 SERVICE_CATEGORY_NOT_FOUND', async () => {
    const res = await put(
      { currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] },
      { cat: 'ghost' },
    ).expect(400);
    expect(asError(res.body).error.code).toBe('SERVICE_CATEGORY_NOT_FOUND');
  });

  it('rejects an unknown country with 400 COUNTRY_NOT_FOUND', async () => {
    const ghostCC = await freshCountryCode(ctx.app);
    const res = await put(
      { currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] },
      { cc: ghostCC },
    ).expect(400);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('rejects a currency that is not the country’s with 422', async () => {
    const res = await put({
      currency: 'USD',
      rungs: [{ minQty: 0, sellMicros: 90000 }],
    }).expect(422);
    expect(asError(res.body).error.code).toBe('RATE_CURRENCY_MISMATCH');
  });

  it('404s: unknown workspace and not-enrolled service', async () => {
    const unknownWs = await put(
      { currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] },
      { ws: UNKNOWN_UUID },
    ).expect(404);
    expect(asError(unknownWs.body).error.code).toBe('WORKSPACE_NOT_FOUND');

    const otherService = await seedService(ctx.app);
    const notEnrolled = await put(
      { currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] },
      { key: otherService },
    ).expect(404);
    expect(asError(notEnrolled.body).error.code).toBe(
      'WORKSPACE_SERVICE_NOT_FOUND',
    );
  });

  it('refuses staff below ADMIN with 403 and anonymous with 401', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await put(
      { currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] },
      { auth: supportToken },
    ).expect(403);
    await request(ctx.app.getHttpServer())
      .put(
        `/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates/IN/default`,
      )
      .send({ currency: 'INR', rungs: [{ minQty: 0, sellMicros: 90000 }] })
      .expect(401);
  });
});
