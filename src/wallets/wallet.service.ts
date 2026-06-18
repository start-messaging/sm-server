import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { Wallet } from './entities/wallet.entity';
import {
  WalletTransaction,
  WalletTxSubType,
  WalletTxType,
} from './entities/wallet-transaction.entity';

/** A single ledger movement. `amountMicros` is always the positive magnitude. */
export interface LedgerInput {
  workspaceId: string;
  amountMicros: string | number;
  currency: string;
  subType: WalletTxSubType;
  referenceType?: string | null;
  referenceId?: string | null;
  /** UNIQUE — replaying the same key is a no-op that returns the first row. */
  idempotencyKey: string;
  metadata?: Record<string, unknown> | null;
}

/** Which balances a given `type` moves, and the floor it must not breach. */
interface Movement {
  type: WalletTxType;
  /** Signed delta applied to `balance_micros`. */
  balanceSign: -1n | 0n | 1n;
  /** Signed delta applied to `held_micros`. */
  heldSign: -1n | 0n | 1n;
}

const MOVEMENTS: Record<
  'credit' | 'debit' | 'hold' | 'release' | 'refund',
  Movement
> = {
  credit: { type: WalletTxType.CREDIT, balanceSign: 1n, heldSign: 0n },
  debit: { type: WalletTxType.DEBIT, balanceSign: -1n, heldSign: 0n },
  hold: { type: WalletTxType.HOLD, balanceSign: -1n, heldSign: 1n },
  release: { type: WalletTxType.RELEASE, balanceSign: 1n, heldSign: -1n },
  refund: { type: WalletTxType.REFUND, balanceSign: 1n, heldSign: 0n },
};

/**
 * The money primitives (docs §5.5). Every movement is idempotent and
 * lock-safe: the UNIQUE `idempotency_key` is the real guarantee against
 * double-processing, and a `pessimistic_write` lock on the wallet row
 * serialises concurrent movements so the cached balance can never drift or go
 * negative. All methods accept an optional `EntityManager` so callers (e.g.
 * the Phase 6 send pipeline) can compose a debit inside their own transaction.
 */
@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly wallets: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly logger: AppLogger,
  ) {}

  /** Create the workspace's wallet (called inside the workspace-create tx). */
  createWallet(
    em: EntityManager,
    input: { workspaceId: string; currency: string },
  ): Promise<Wallet> {
    return em.save(
      em.create(Wallet, {
        workspaceId: input.workspaceId,
        currency: input.currency,
        balanceMicros: '0',
        heldMicros: '0',
      }),
    );
  }

  /** The wallet for a workspace, or a hard 404 (callers should fund first). */
  async getByWorkspaceOrFail(workspaceId: string): Promise<Wallet> {
    const wallet = await this.wallets.findOne({ where: { workspaceId } });
    if (!wallet) {
      throw new AppException(
        { code: 'WALLET_NOT_FOUND', message: 'This workspace has no wallet' },
        404,
      );
    }
    return wallet;
  }

  /**
   * The workspace's wallet, creating a zeroed one if it is somehow missing.
   * New workspaces are funded in the create transaction and `db:seed`
   * backfills the pre-reset ones, so this only self-heals an edge case — but it
   * keeps reads (e.g. the admin Wallet tab) from ever 404-ing on a real
   * workspace. Concurrent first-touch is settled by the unique index.
   */
  async ensureWallet(workspaceId: string, currency: string): Promise<Wallet> {
    const existing = await this.wallets.findOne({ where: { workspaceId } });
    if (existing) return existing;
    try {
      return await this.wallets.save(
        this.wallets.create({
          workspaceId,
          currency,
          balanceMicros: '0',
          heldMicros: '0',
        }),
      );
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        return this.getByWorkspaceOrFail(workspaceId);
      }
      throw err;
    }
  }

  credit(input: LedgerInput, em?: EntityManager): Promise<WalletTransaction> {
    return this.applyTxn(MOVEMENTS.credit, input, em);
  }

  debit(input: LedgerInput, em?: EntityManager): Promise<WalletTransaction> {
    return this.applyTxn(MOVEMENTS.debit, input, em);
  }

  hold(input: LedgerInput, em?: EntityManager): Promise<WalletTransaction> {
    return this.applyTxn(MOVEMENTS.hold, input, em);
  }

  release(input: LedgerInput, em?: EntityManager): Promise<WalletTransaction> {
    return this.applyTxn(MOVEMENTS.release, input, em);
  }

  refund(input: LedgerInput, em?: EntityManager): Promise<WalletTransaction> {
    return this.applyTxn(MOVEMENTS.refund, input, em);
  }

  /* ------------------------------ internals ----------------------------- */

  private run<T>(
    em: EntityManager | undefined,
    fn: (m: EntityManager) => Promise<T>,
  ): Promise<T> {
    return em ? fn(em) : this.dataSource.transaction(fn);
  }

  private async applyTxn(
    move: Movement,
    input: LedgerInput,
    em?: EntityManager,
  ): Promise<WalletTransaction> {
    const amount = BigInt(input.amountMicros);
    if (amount <= 0n) {
      throw new AppException(
        {
          code: 'WALLET_AMOUNT_INVALID',
          message: 'Amount must be a positive number of micros',
        },
        400,
      );
    }

    return this.run(em, async (m) => {
      const txns = m.getRepository(WalletTransaction);

      // 1. Idempotency — a replayed key returns the original row, no movement.
      const existing = await txns.findOne({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;

      // 2. Serialise concurrent movements on this wallet (cached balance is
      //    only safe to read+write under the row lock).
      const wallet = await m
        .getRepository(Wallet)
        .createQueryBuilder('w')
        .setLock('pessimistic_write')
        .where('w.workspace_id = :wsId', { wsId: input.workspaceId })
        .getOne();
      if (!wallet) {
        throw new AppException(
          { code: 'WALLET_NOT_FOUND', message: 'This workspace has no wallet' },
          404,
        );
      }

      // 3. One currency per wallet (docs §9 Rule R3) — never debit across FX.
      if (input.currency !== wallet.currency) {
        throw new AppException(
          {
            code: 'WALLET_CURRENCY_MISMATCH',
            message: `Wallet currency is ${wallet.currency}, got ${input.currency}`,
          },
          422,
        );
      }

      // 4. Apply the signed movement and enforce non-negative floors.
      const newBalance =
        BigInt(wallet.balanceMicros) + move.balanceSign * amount;
      const newHeld = BigInt(wallet.heldMicros) + move.heldSign * amount;
      if (newBalance < 0n) {
        throw new AppException(
          {
            code: 'INSUFFICIENT_FUNDS',
            message: 'Wallet balance is too low for this operation',
            details: {
              balanceMicros: wallet.balanceMicros,
              requiredMicros: amount.toString(),
              currency: wallet.currency,
            },
          },
          402,
        );
      }
      if (newHeld < 0n) {
        throw new AppException(
          {
            code: 'INSUFFICIENT_HELD',
            message: 'Cannot release more than is currently held',
            details: {
              heldMicros: wallet.heldMicros,
              requiredMicros: amount.toString(),
            },
          },
          422,
        );
      }

      // 5. Append the immutable ledger row. The UNIQUE key is the backstop for
      //    a same-key race that slipped past step 1 before the lock.
      let txn: WalletTransaction;
      try {
        txn = await txns.save(
          txns.create({
            walletId: wallet.id,
            type: move.type,
            subType: input.subType,
            amountMicros: amount.toString(),
            balanceAfterMicros: newBalance.toString(),
            heldAfterMicros: newHeld.toString(),
            currency: wallet.currency,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            idempotencyKey: input.idempotencyKey,
            metadata: input.metadata ?? null,
          }),
        );
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          (err.driverError as { code?: string }).code === '23505'
        ) {
          const winner = await txns.findOne({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (winner) return winner;
        }
        throw err;
      }

      // 6. Keep the cached balance in lock-step with the ledger.
      wallet.balanceMicros = newBalance.toString();
      wallet.heldMicros = newHeld.toString();
      await m.getRepository(Wallet).save(wallet);

      this.logger.log(
        {
          event: 'wallet.txn',
          workspaceId: input.workspaceId,
          type: move.type,
          subType: input.subType,
          amountMicros: amount.toString(),
          balanceAfterMicros: newBalance.toString(),
        },
        'Wallets',
      );
      return txn;
    });
  }
}
