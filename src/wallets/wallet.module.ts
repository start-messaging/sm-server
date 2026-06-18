import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { WalletTransaction } from './entities/wallet-transaction.entity';
import { WalletService } from './wallet.service';

/**
 * Billing Core — the channel-agnostic money primitives. `WalletService` is the
 * single writer of `wallets` + `wallet_transactions`; it is exported for every
 * spender to reuse (workspace creation funds a wallet, Phase 6 debits a
 * message, Phase 8 holds a campaign, Phase 9 credits a referral).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Wallet, WalletTransaction])],
  providers: [WalletService],
  exports: [WalletService, TypeOrmModule],
})
export class WalletModule {}
