import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import {
  ensureFreePlan,
  seedAvailableServiceIN,
  seedOnboardedWorkspace,
} from '../helpers/workspaces';
import { Wallet } from '../../src/wallets/entities/wallet.entity';
import {
  WalletTransaction,
  WalletTxSubType,
} from '../../src/wallets/entities/wallet-transaction.entity';
import { WalletService } from '../../src/wallets/wallet.service';

/**
 * The UNIQUE idempotency key makes a replay a no-op (a Meta webhook retry, a
 * campaign restart) — the same row comes back and the balance moves once.
 */
describe('WalletService idempotency', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let wallets: WalletService;
  let walletRepo: Repository<Wallet>;
  let txRepo: Repository<WalletTransaction>;
  let workspaceId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    wallets = ctx.app.get(WalletService);
    walletRepo = ctx.app.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    txRepo = ctx.app.get<Repository<WalletTransaction>>(
      getRepositoryToken(WalletTransaction),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    const { workspace } = await seedOnboardedWorkspace(
      ctx.app,
      ctx.app.getHttpServer(),
      serviceKey,
    );
    workspaceId = workspace.id;
  });

  it('replaying a key returns the first row and moves the balance once', async () => {
    const key = `idem:${workspaceId}`;
    const first = await wallets.credit({
      workspaceId,
      amountMicros: 500_000,
      currency: 'INR',
      subType: WalletTxSubType.RECHARGE,
      idempotencyKey: key,
    });
    const replay = await wallets.credit({
      workspaceId,
      amountMicros: 500_000,
      currency: 'INR',
      subType: WalletTxSubType.RECHARGE,
      idempotencyKey: key,
    });

    expect(replay.id).toBe(first.id);
    const wallet = await walletRepo.findOneByOrFail({ workspaceId });
    expect(wallet.balanceMicros).toBe('500000');
    const count = await txRepo.count({
      where: { walletId: wallet.id, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });

  it('settles a concurrent same-key race to a single row', async () => {
    const key = `race:${workspaceId}`;
    const make = () =>
      wallets.credit({
        workspaceId,
        amountMicros: 250_000,
        currency: 'INR',
        subType: WalletTxSubType.RECHARGE,
        idempotencyKey: key,
      });
    await Promise.all([make(), make(), make()]);

    const wallet = await walletRepo.findOneByOrFail({ workspaceId });
    expect(wallet.balanceMicros).toBe('250000');
    const count = await txRepo.count({
      where: { walletId: wallet.id, idempotencyKey: key },
    });
    expect(count).toBe(1);
  });
});
