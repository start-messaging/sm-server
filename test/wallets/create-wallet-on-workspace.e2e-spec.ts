import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { Wallet } from '../../src/wallets/entities/wallet.entity';

/**
 * Creating a workspace must atomically create exactly one wallet, locked to the
 * workspace currency and starting at zero (docs T2).
 */
describe('Workspace creation funds a wallet', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let wallets: Repository<Wallet>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    wallets = ctx.app.get<Repository<Wallet>>(getRepositoryToken(Wallet));
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates one zeroed wallet in the workspace currency', async () => {
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );

    const rows = await wallets.find({ where: { workspaceId: ws.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      currency: ws.defaultCurrency,
      balanceMicros: '0',
      heldMicros: '0',
    });
  });
});
