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

interface WalletView {
  wallet: { balanceMicros: string; currency: string };
  recent: { type: string; subType: string; amountMicros: string }[];
}

describe('POST /v1/admin/workspaces/:id/wallet/adjust', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let adminToken: string;
  let financeToken: string;
  let supportToken: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);

    const admin = await createStaff(ctx.app, PlatformRole.ADMIN);
    adminToken = await loginStaff(ctx.app.getHttpServer(), admin.email);
    const finance = await createStaff(ctx.app, PlatformRole.FINANCE);
    financeToken = await loginStaff(ctx.app.getHttpServer(), finance.email);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    supportToken = await loginStaff(ctx.app.getHttpServer(), support.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const freshWorkspace = async () => {
    const { workspace } = await seedOnboardedWorkspace(
      ctx.app,
      ctx.app.getHttpServer(),
      serviceKey,
    );
    return workspace.id;
  };

  const adjust = (wsId: string, token: string, body: object) =>
    request(ctx.app.getHttpServer())
      .post(`/v1/admin/workspaces/${wsId}/wallet/adjust`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  it('credits a wallet and records a manual_adjustment ledger row', async () => {
    const wsId = await freshWorkspace();
    const res = await adjust(wsId, adminToken, {
      direction: 'credit',
      amountMicros: 5_000_000,
      reason: 'Goodwill top-up',
    }).expect(201);
    const view = asSuccess<WalletView>(res.body).data;
    expect(view.wallet.balanceMicros).toBe('5000000');
    expect(view.recent[0]).toMatchObject({
      type: 'credit',
      subType: 'manual_adjustment',
      amountMicros: '5000000',
    });
  });

  it('lets FINANCE debit and reflects the new balance', async () => {
    const wsId = await freshWorkspace();
    await adjust(wsId, financeToken, {
      direction: 'credit',
      amountMicros: 2_000_000,
      reason: 'seed',
    }).expect(201);
    const res = await adjust(wsId, financeToken, {
      direction: 'debit',
      amountMicros: 800_000,
      reason: 'correction',
    }).expect(201);
    expect(asSuccess<WalletView>(res.body).data.wallet.balanceMicros).toBe(
      '1200000',
    );
  });

  it('402s a debit larger than the balance', async () => {
    const wsId = await freshWorkspace();
    const res = await adjust(wsId, adminToken, {
      direction: 'debit',
      amountMicros: 1_000_000,
      reason: 'overdraw',
    }).expect(402);
    expect(asError(res.body).error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('forbids non-finance staff (SUPPORT) with 403', async () => {
    const wsId = await freshWorkspace();
    await adjust(wsId, supportToken, {
      direction: 'credit',
      amountMicros: 1_000_000,
      reason: 'nope',
    }).expect(403);
  });

  it('400s an invalid amount', async () => {
    const wsId = await freshWorkspace();
    await adjust(wsId, adminToken, {
      direction: 'credit',
      amountMicros: 0,
      reason: 'zero',
    }).expect(400);
  });
});
