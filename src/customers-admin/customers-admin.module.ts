import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { CountriesModule } from '../countries/countries.module';
import { WorkspaceInvitation } from '../members/entities/workspace-invitation.entity';
import { PricingModule } from '../pricing/pricing.module';
import { ServiceCountryRate } from '../services/entities/service-country-rate.entity';
import { Service } from '../services/entities/service.entity';
import { User } from '../users/entities/user.entity';
import { WalletModule } from '../wallets/wallet.module';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WabaAccount } from '../whatsapp/entities/waba-account.entity';
import { PhoneNumber } from '../whatsapp/entities/phone-number.entity';
import { WaSubscription } from '../whatsapp/entities/wa-subscription.entity';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminWalletsController } from './admin-wallets.controller';
import { AdminWalletsService } from './admin-wallets.service';
import { AdminWorkspacesController } from './admin-workspaces.controller';
import { AdminWorkspacesService } from './admin-workspaces.service';
import { WorkspaceRatesController } from './workspace-rates.controller';
import { WorkspaceRatesService } from './workspace-rates.service';

/**
 * Staff-facing surface over CUSTOMERS: read users + their workspaces, and
 * manage workspace-tier pricing (the unified ladder). Reads = any staff;
 * writes = SUPER_ADMIN + ADMIN. Read-only over identity — signup remains the
 * only door for creating users/workspaces.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Workspace,
      WorkspaceMember,
      WorkspaceService,
      WorkspaceServiceRate,
      WorkspaceInvitation,
      Service,
      ServiceCountryRate,
      WabaAccount,
      PhoneNumber,
      WaSubscription,
    ]),
    // AdminModule: staff JWT strategy + guards for `@StaffAuth`.
    // CountriesModule: currency cross-check when writing a ladder.
    // PricingModule: resolve-preview + cache invalidation on ladder writes.
    // WalletModule: the money primitives behind the admin Wallet tab.
    AdminModule,
    CountriesModule,
    PricingModule,
    WalletModule,
  ],
  controllers: [
    AdminUsersController,
    AdminWorkspacesController,
    WorkspaceRatesController,
    AdminWalletsController,
  ],
  providers: [
    AdminUsersService,
    AdminWorkspacesService,
    WorkspaceRatesService,
    AdminWalletsService,
  ],
})
export class CustomersAdminModule {}
