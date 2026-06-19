import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { MailerModule } from '../mailer/mailer.module';
import { UsersModule } from '../users/users.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { WorkspaceInvitation } from './entities/workspace-invitation.entity';
import { InvitationsController } from './invitations.controller';
import { MemberInviteService } from './member-invite.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Workspace member invites (Phase 2). Reuses the staff invite/accept token
 * model and the plan-limit template. Imports:
 *  - WorkspacesModule: WorkspaceMemberGuard + PlanLimitService + the
 *    Workspace/WorkspaceMember repos (re-exported TypeOrmModule).
 *  - AuthModule: JwtAuthGuard (user strategy) + AuthService (issue a session
 *    when a brand-new user claims an invite).
 *  - UsersModule / MailerModule: identity lookup/creation + the invite email.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([WorkspaceInvitation]),
    WorkspacesModule,
    AuthModule,
    UsersModule,
    MailerModule,
  ],
  controllers: [MembersController, InvitationsController],
  providers: [MembersService, MemberInviteService],
})
export class MembersModule {}
