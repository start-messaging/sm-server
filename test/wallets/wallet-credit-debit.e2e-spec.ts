import { HttpException } from '@nestjs/common';
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
 * The ledger is the source of truth; the wallet caches its sum. After any
 * movement the three must agree: wallet.balance == row.balance_after == Σ rows.
 */
describe('WalletService credit + debit (ledger integrity)', () => {
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

  it('credits then debits, with agreeing snapshots and cached balance', async () => {
    const credit = await wallets.credit({
      workspaceId,
      amountMicros: 1_000_000,
      currency: 'INR',
      subType: WalletTxSubType.RECHARGE,
      idempotencyKey: `c:${workspaceId}`,
    });
    expect(credit.balanceAfterMicros).toBe('1000000');

    const debit = await wallets.debit({
      workspaceId,
      amountMicros: 400_000,
      currency: 'INR',
      subType: WalletTxSubType.MESSAGE_CHARGE,
      referenceType: 'message',
      referenceId: 'wamid.test',
      idempotencyKey: `d:${workspaceId}`,
    });
    expect(debit.balanceAfterMicros).toBe('600000');

    const wallet = await walletRepo.findOneByOrFail({ workspaceId });
    expect(wallet.balanceMicros).toBe('600000');
    const rows = await txRepo.find({ where: { walletId: wallet.id } });
    expect(rows).toHaveLength(2);
  });

  it('rejects a movement whose currency is not the wallet currency (422)', async () => {
    expect.assertions(2);
    try {
      await wallets.credit({
        workspaceId,
        amountMicros: 1,
        currency: 'USD',
        subType: WalletTxSubType.RECHARGE,
        idempotencyKey: `usd:${workspaceId}`,
      });
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(422);
      expect((err.getResponse() as { code: string }).code).toBe(
        'WALLET_CURRENCY_MISMATCH',
      );
    }
  });
});
