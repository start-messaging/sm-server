import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CountriesModule } from '../countries/countries.module';
import { PlansModule } from '../plans/plans.module';
import { WorkspaceInvitation } from '../members/entities/workspace-invitation.entity';
import { ServicesModule } from '../services/services.module';
import { WaContact } from '../whatsapp/entities/wa-contact.entity';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallets/wallet.module';
import { CreateWorkspaceController } from './create-workspace.controller';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { WorkspaceServiceRate } from './entities/workspace-service-rate.entity';
import { WorkspaceService } from './entities/workspace-service.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { PlanLimitService } from './plan-limit.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      WorkspaceMember,
      WorkspaceService,
      WorkspaceServiceRate,
      // Registered so PlanLimitService can count PENDING invitations (reserved
      // seats) toward max_members / max_agents.
      WorkspaceInvitation,
      // Registered so PlanLimitService can count contacts toward max_contacts.
      WaContact,
    ]),
    UsersModule,
    CountriesModule,
    // ServicesModule: availability check; PlansModule: the FREE plan;
    // AuthModule: registers the user-jwt strategy the guards rely on;
    // WalletModule: funds a wallet in the same workspace-create transaction.
    ServicesModule,
    PlansModule,
    AuthModule,
    WalletModule,
  ],
  controllers: [WorkspacesController, CreateWorkspaceController],
  providers: [WorkspacesService, PlanLimitService, WorkspaceMemberGuard],
  // Guard + entities + plan-limit enforcement exported for workspace-scoped
  // modules (members, settings, billing) to reuse.
  exports: [
    WorkspacesService,
    WorkspaceMemberGuard,
    PlanLimitService,
    TypeOrmModule,
  ],
})
export class WorkspacesModule {}
