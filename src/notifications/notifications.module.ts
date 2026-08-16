import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { FcmWebTokensController } from './controllers/fcm-web-tokens.controller';
import { FcmWebToken } from './entities/fcm-web-token.entity';
import { FcmPushService } from './services/fcm-push.service';
import { FcmWebTokensService } from './services/fcm-web-tokens.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FcmWebToken, WorkspaceMember, Workspace]),
    AuthModule,
  ],
  controllers: [FcmWebTokensController],
  providers: [FcmPushService, FcmWebTokensService],
  exports: [FcmPushService, FcmWebTokensService],
})
export class NotificationsModule {}
