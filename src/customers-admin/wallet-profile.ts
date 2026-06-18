import type { Wallet } from '../wallets/entities/wallet.entity';
import type {
  WalletTransaction,
  WalletTxSubType,
  WalletTxType,
} from '../wallets/entities/wallet-transaction.entity';

/** The wallet header for the admin tab + the customer dashboard. Money is
 *  micros as STRING (high-magnitude — never coerced to a JS number). */
export interface WalletProfile {
  balanceMicros: string;
  heldMicros: string;
  currency: string;
  lowBalanceThresholdMicros: string | null;
  updatedAt: Date;
}

/** One immutable ledger row, presented. */
export interface WalletTxProfile {
  id: string;
  type: WalletTxType;
  subType: WalletTxSubType;
  amountMicros: string;
  balanceAfterMicros: string;
  heldAfterMicros: string;
  currency: string;
  referenceType: string | null;
  referenceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export function presentWallet(wallet: Wallet): WalletProfile {
  return {
    balanceMicros: wallet.balanceMicros,
    heldMicros: wallet.heldMicros,
    currency: wallet.currency,
    lowBalanceThresholdMicros: wallet.lowBalanceThresholdMicros,
    updatedAt: wallet.updatedAt,
  };
}

export function presentWalletTx(txn: WalletTransaction): WalletTxProfile {
  return {
    id: txn.id,
    type: txn.type,
    subType: txn.subType,
    amountMicros: txn.amountMicros,
    balanceAfterMicros: txn.balanceAfterMicros,
    heldAfterMicros: txn.heldAfterMicros,
    currency: txn.currency,
    referenceType: txn.referenceType,
    referenceId: txn.referenceId,
    metadata: txn.metadata,
    createdAt: txn.createdAt,
  };
}
