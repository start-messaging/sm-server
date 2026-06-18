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
import { WalletTxSubType } from '../../src/wallets/entities/wallet-transaction.entity';
import { WalletService } from '../../src/wallets/wallet.service';

/**
 * Campaign holds (Phase 8) move balance into `held` and back. A hold reserves
 * funds; a release returns the unused remainder. You cannot release more than
 * is held.
 */
describe('WalletService hold + release', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let wallets: WalletService;
  let walletRepo: Repository<Wallet>;
  let workspaceId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    wallets = ctx.app.get(WalletService);
    walletRepo = ctx.app.get<Repository<Wallet>>(getRepositoryToken(Wallet));
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
    await wallets.credit({
      workspaceId,
      amountMicros: 1_000_000,
      currency: 'INR',
      subType: WalletTxSubType.RECHARGE,
      idempotencyKey: `fund:${workspaceId}`,
    });
  });

  it('hold moves balance→held; release returns the remainder', async () => {
    const hold = await wallets.hold({
      workspaceId,
      amountMicros: 600_000,
      currency: 'INR',
      subType: WalletTxSubType.CAMPAIGN_HOLD,
      referenceType: 'campaign',
      referenceId: 'camp-1',
      idempotencyKey: `h:${workspaceId}`,
    });
    expect(hold.balanceAfterMicros).toBe('400000');
    expect(hold.heldAfterMicros).toBe('600000');

    const release = await wallets.release({
      workspaceId,
      amountMicros: 250_000,
      currency: 'INR',
      subType: WalletTxSubType.CAMPAIGN_RELEASE,
      referenceType: 'campaign',
      referenceId: 'camp-1',
      idempotencyKey: `r:${workspaceId}`,
    });
    expect(release.balanceAfterMicros).toBe('650000');
    expect(release.heldAfterMicros).toBe('350000');

    const wallet = await walletRepo.findOneByOrFail({ workspaceId });
    expect(wallet.balanceMicros).toBe('650000');
    expect(wallet.heldMicros).toBe('350000');
  });

  it('cannot release more than is held (422)', async () => {
    await wallets.hold({
      workspaceId,
      amountMicros: 100_000,
      currency: 'INR',
      subType: WalletTxSubType.CAMPAIGN_HOLD,
      referenceType: 'campaign',
      referenceId: 'camp-2',
      idempotencyKey: `h2:${workspaceId}`,
    });

    expect.assertions(2);
    try {
      await wallets.release({
        workspaceId,
        amountMicros: 999_999,
        currency: 'INR',
        subType: WalletTxSubType.CAMPAIGN_RELEASE,
        referenceType: 'campaign',
        referenceId: 'camp-2',
        idempotencyKey: `r2:${workspaceId}`,
      });
    } catch (e) {
      const err = e as HttpException;
      expect(err.getStatus()).toBe(422);
      expect((err.getResponse() as { code: string }).code).toBe(
        'INSUFFICIENT_HELD',
      );
    }
  });
});
