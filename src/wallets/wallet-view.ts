import type { Wallet } from './entities/wallet.entity';

/**
 * The read-only balance a workspace member sees on their dashboard. Money is
 * micros as STRING; the client formats via its shared money helper. No ledger,
 * no recharge — top-ups arrive with the payments slice.
 */
export interface WalletBalanceView {
  balanceMicros: string;
  heldMicros: string;
  currency: string;
  lowBalanceThresholdMicros: string | null;
}

export function presentWalletBalance(wallet: Wallet): WalletBalanceView {
  return {
    balanceMicros: wallet.balanceMicros,
    heldMicros: wallet.heldMicros,
    currency: wallet.currency,
    lowBalanceThresholdMicros: wallet.lowBalanceThresholdMicros,
  };
}
