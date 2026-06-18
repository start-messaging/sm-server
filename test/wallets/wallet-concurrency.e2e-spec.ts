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
 * The pessimistic row lock serialises concurrent debits on one wallet: even
 * when more debits are fired than the balance covers, exactly the affordable
 * number commit, the balance lands exactly at zero, and it never goes negative.
 */
describe('WalletService concurrency (no oversell)', () => {
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

  it('serialises 12 concurrent debits against a balance that covers 10', async () => {
    await wallets.credit({
      workspaceId,
      amountMicros: 1_000_000,
      currency: 'INR',
      subType: WalletTxSubType.RECHARGE,
      idempotencyKey: `fund:${workspaceId}`,
    });

    const PER = 100_000; // 10 fit exactly; the other 2 must fail
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        wallets.debit({
          workspaceId,
          amountMicros: PER,
          currency: 'INR',
          subType: WalletTxSubType.MESSAGE_CHARGE,
          referenceType: 'message',
          referenceId: `m${i}`,
          idempotencyKey: `dz:${workspaceId}:${i}`,
        }),
      ),
    );

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter((r) => r.status === 'rejected').length;
    expect(ok).toBe(10);
    expect(rejected).toBe(2);

    const wallet = await walletRepo.findOneByOrFail({ workspaceId });
    expect(wallet.balanceMicros).toBe('0');
    expect(BigInt(wallet.balanceMicros) >= 0n).toBe(true);
    const debits = await txRepo.count({ where: { walletId: wallet.id } });
    expect(debits).toBe(11); // 1 credit + 10 debits
  });
});
