import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  ensureFreePlan,
  seedAvailableServiceIN,
  seedOnboardedWorkspace,
} from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface WalletView {
  wallet: { balanceMicros: string; heldMicros: string; currency: string };
  recent: unknown[];
}

describe('GET /v1/admin/workspaces/:id/wallet', () => {
  let ctx: TestAppContext;
  let token: string;
  let wsId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    token = await loginStaff(ctx.app.getHttpServer(), support.email);
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const { workspace } = await seedOnboardedWorkspace(
      ctx.app,
      ctx.app.getHttpServer(),
      serviceKey,
    );
    wsId = workspace.id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a zeroed wallet with an empty ledger (any staff)', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/wallet`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const view = asSuccess<WalletView>(res.body).data;
    expect(view.wallet).toMatchObject({
      balanceMicros: '0',
      heldMicros: '0',
      currency: 'INR',
    });
    expect(view.recent).toEqual([]);
  });

  it('paginates the (empty) transactions list', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/wallet/transactions`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const page = asSuccess<{ items: unknown[]; meta: { total: number } }>(
      res.body,
    ).data;
    expect(page.items).toEqual([]);
    expect(page.meta.total).toBe(0);
  });

  it('404s an unknown workspace', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${UNKNOWN_UUID}/wallet`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${wsId}/wallet`)
      .expect(401);
  });
});
