import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, type Paginated } from '../common/types/pagination';
import {
  WalletTransaction,
  WalletTxSubType,
} from '../wallets/entities/wallet-transaction.entity';
import { WalletService } from '../wallets/wallet.service';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import {
  presentWallet,
  presentWalletTx,
  type WalletProfile,
  type WalletTxProfile,
} from './wallet-profile';

/** Recent ledger rows shown inline on the wallet header. */
const RECENT_TX_LIMIT = 10;

export interface AdminWalletView {
  wallet: WalletProfile;
  recent: WalletTxProfile[];
}

/**
 * Staff-facing view + manual control of a workspace wallet. Reads are
 * any-staff; the adjustment write is FINANCE-grade (gated in the controller).
 * All movements go through `WalletService` — the same locked, idempotent,
 * ledger-backed primitives every other spender uses.
 */
@Injectable()
export class AdminWalletsService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WalletTransaction)
    private readonly txns: Repository<WalletTransaction>,
    private readonly wallets: WalletService,
  ) {}

  async getWallet(workspaceId: string): Promise<AdminWalletView> {
    const wallet = await this.resolveWallet(workspaceId);
    const recent = await this.txns.find({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: RECENT_TX_LIMIT,
    });
    return {
      wallet: presentWallet(wallet),
      recent: recent.map(presentWalletTx),
    };
  }

  async listTransactions(
    workspaceId: string,
    query: PaginationQueryDto,
  ): Promise<Paginated<WalletTxProfile>> {
    const wallet = await this.resolveWallet(workspaceId);
    const [rows, total] = await this.txns.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.take,
    });
    return paginate(rows.map(presentWalletTx), total, query);
  }

  async adjust(
    workspaceId: string,
    dto: AdjustWalletDto,
  ): Promise<AdminWalletView> {
    const wallet = await this.resolveWallet(workspaceId);
    const input = {
      workspaceId,
      amountMicros: dto.amountMicros,
      currency: wallet.currency,
      subType: WalletTxSubType.MANUAL_ADJUSTMENT,
      referenceType: 'manual',
      referenceId: null,
      // Each manual adjustment is its own event — a fresh key, never replayed.
      idempotencyKey: `manual:${randomUUID()}`,
      metadata: { reason: dto.reason },
    };
    if (dto.direction === 'credit') {
      await this.wallets.credit(input);
    } else {
      await this.wallets.debit(input);
    }
    return this.getWallet(workspaceId);
  }

  /* ------------------------------ helpers ------------------------------- */

  /** Workspace must exist; its wallet is created on first touch if missing. */
  private async resolveWallet(workspaceId: string) {
    const workspace = await this.workspaces.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new AppException(
        { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' },
        404,
      );
    }
    return this.wallets.ensureWallet(workspaceId, workspace.defaultCurrency);
  }
}
