import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CountriesModule } from '../countries/countries.module';
import { PlansModule } from '../plans/plans.module';
import { ServicesModule } from '../services/services.module';
import { UsersModule } from '../users/users.module';
import { CreateWorkspaceController } from './create-workspace.controller';
import { WorkspaceMember } from './entities/workspace-member.entity';
import { WorkspaceService } from './entities/workspace-service.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { PlanLimitService } from './plan-limit.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, WorkspaceService]),
    UsersModule,
    CountriesModule,
    // ServicesModule: availability check; PlansModule: the FREE plan;
    // AuthModule: registers the user-jwt strategy the guards rely on.
    ServicesModule,
    PlansModule,
    AuthModule,
  ],
  controllers: [WorkspacesController, CreateWorkspaceController],
  providers: [WorkspacesService, PlanLimitService, WorkspaceMemberGuard],
  // Guard + entities exported for future workspace-scoped modules (members,
  // settings, billing) to reuse.
  exports: [WorkspacesService, WorkspaceMemberGuard, TypeOrmModule],
})
export class WorkspacesModule {}
