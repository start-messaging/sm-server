import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedCategory } from '../helpers/reference';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
  seedLadder,
} from '../helpers/workspaces';

describe('DELETE /v1/admin/workspaces/:id/services/:key/rates/:cc/:cat', () => {
  let ctx: TestAppContext;
  let token: string;
  let serviceKey: string;
  let wsId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
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

  const del = (auth = token) =>
    request(ctx.app.getHttpServer())
      .delete(
        `/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates/IN/default`,
      )
      .set('Authorization', `Bearer ${auth}`);

  it('clears the cell — it returns to the country base rate', async () => {
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

    await del().expect(204);

    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const view = asSuccess<{
      countries: {
        countryCode: string;
        cells: {
          categoryKey: string;
          base: { sellMicros: number | null } | null;
          ladder: unknown[];
        }[];
      }[];
    }>(res.body).data;
    const cell = view.countries
      .find((c) => c.countryCode === 'IN')
      ?.cells.find((c) => c.categoryKey === 'default');
    expect(cell?.ladder).toEqual([]);
    // The country BASE row is untouched.
    expect(cell?.base?.sellMicros).toBe(100000);
  });

  it('returns 404 LADDER_NOT_FOUND when the cell has no override', async () => {
    const res = await del().expect(404);
    expect(asError(res.body).error.code).toBe('LADDER_NOT_FOUND');
  });

  it('refuses staff below ADMIN with 403 and anonymous with 401', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await del(supportToken).expect(403);
    await request(ctx.app.getHttpServer())
      .delete(
        `/v1/admin/workspaces/${wsId}/services/${serviceKey}/rates/IN/default`,
      )
      .expect(401);
  });
});
