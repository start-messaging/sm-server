import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MetaWebhookController } from './controllers/meta-webhook.controller';
import { WhatsappConnectController } from './controllers/whatsapp-connect.controller';
import { WhatsappTemplatesController } from './controllers/whatsapp-templates.controller';
import { WhatsappMessagesController } from './controllers/whatsapp-messages.controller';
import { WhatsappInboxEventsController } from './controllers/whatsapp-inbox-events.controller';
import { WhatsappContactsController } from './controllers/whatsapp-contacts.controller';
import { WhatsappCampaignsController } from './controllers/whatsapp-campaigns.controller';
import { WhatsappBillingController } from './controllers/whatsapp-billing.controller';
import { AdminTemplateExamplesController } from './controllers/admin-template-examples.controller';
import { AdminConnectedWabasController } from './controllers/admin-connected-wabas.controller';
import { AdminInboxOpsController } from './controllers/admin-inbox-ops.controller';
import { AdminPipelineStageTemplatesController } from './controllers/admin-pipeline-stage-templates.controller';
import { WhatsappTemplateExamplesController } from './controllers/whatsapp-template-examples.controller';
import { WhatsappQuickRepliesController } from './controllers/whatsapp-quick-replies.controller';
import { WhatsappFlowsController } from './controllers/whatsapp-flows.controller';
import { WhatsappPipelineStagesController } from './controllers/whatsapp-pipeline-stages.controller';
import { WhatsappInboxSettingsController } from './controllers/whatsapp-inbox-settings.controller';
import { WhatsappInboxPresenceController } from './controllers/whatsapp-inbox-presence.controller';
import { WhatsappAnalyticsController } from './controllers/whatsapp-analytics.controller';
import { WhatsappApiKeysController } from './controllers/whatsapp-api-keys.controller';
import { WhatsappTriggerController } from './controllers/whatsapp-trigger.controller';
import { WhatsappRealtimeModule } from './realtime/whatsapp-realtime.module';
import { PhoneNumber } from './entities/phone-number.entity';
import { WabaAccount } from './entities/waba-account.entity';
import { WaWebhookEvent } from './entities/wa-webhook-event.entity';
import { WaTemplate } from './entities/wa-template.entity';
import { WaTemplateExample } from './entities/wa-template-example.entity';
import { WaContact } from './entities/wa-contact.entity';
import { WaConversation } from './entities/wa-conversation.entity';
import { WaMessage } from './entities/wa-message.entity';
import { WaCampaign } from './entities/wa-campaign.entity';
import { WaSubscription } from './entities/wa-subscription.entity';
import { WaContactNote } from './entities/wa-contact-note.entity';
import { WaQuickReply } from './entities/wa-quick-reply.entity';
import { WaPipelineStage } from './entities/wa-pipeline-stage.entity';
import { WaInboxSettings } from './entities/wa-inbox-settings.entity';
import { WaAssignmentEvent } from './entities/wa-assignment-event.entity';
import { WaPipelineStageTemplate } from './entities/wa-pipeline-stage-template.entity';
import { WaFlow } from './entities/wa-flow.entity';
import { WaFlowSession } from './entities/wa-flow-session.entity';
import { WaApiKey } from './entities/wa-api-key.entity';
import { WaAutoReplyRule } from './auto-replies/wa-auto-reply-rule.entity';
import { WhatsappAutoRepliesService } from './auto-replies/whatsapp-auto-replies.service';
import { WhatsappAutoRepliesController } from './auto-replies/whatsapp-auto-replies.controller';
import { WaWebhookQueueModule } from './queue/wa-webhook-queue.module';
import { WaCampaignQueueModule } from './queue/wa-campaign-queue.module';
import { MetaGraphClient } from './services/meta-graph.client';
import { WhatsappConnectService } from './services/whatsapp-connect.service';
import { WhatsappTemplatesService } from './services/whatsapp-templates.service';
import { WhatsappMessagesService } from './services/whatsapp-messages.service';
import { WhatsappSendService } from './services/whatsapp-send.service';
import { WhatsappContactsService } from './services/whatsapp-contacts.service';
import { WhatsappCampaignsService } from './services/whatsapp-campaigns.service';
import { WhatsappBillingService } from './services/whatsapp-billing.service';
import { BillingProviderService } from './services/billing-provider.service';
import { WaTemplateExamplesService } from './services/wa-template-examples.service';
import { AdminConnectedWabasService } from './services/admin-connected-wabas.service';
import { AdminInboxOpsService } from './services/admin-inbox-ops.service';
import { AdminPipelineStageTemplatesService } from './services/admin-pipeline-stage-templates.service';
import { WhatsappQuickRepliesService } from './services/whatsapp-quick-replies.service';
import { WhatsappFlowsService } from './services/whatsapp-flows.service';
import { WhatsappPipelineStagesService } from './services/whatsapp-pipeline-stages.service';
import { WhatsappInboxSettingsService } from './services/whatsapp-inbox-settings.service';
import { WhatsappInboxPresenceService } from './services/whatsapp-inbox-presence.service';
import { WhatsappMediaService } from './services/whatsapp-media.service';
import { WhatsappAnalyticsService } from './services/whatsapp-analytics.service';
import { WhatsappApiKeysService } from './services/whatsapp-api-keys.service';
import { R2UploadService } from '../common/services/r2-upload.service';
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ApiKeyGuard } from './guards/api-key.guard';
import { RequiresFeatureGuard } from './guards/requires-feature.guard';
import { Plan } from '../plans/entities/plan.entity';
import { User } from '../users/entities/user.entity';
import { PaymentsModule } from '../payments/payments.module';
import { AdminModule } from '../admin/admin.module';

/**
 * WhatsApp CRM — self-contained vertical.
 *
 * Phase 0-7 surfaces: connect, templates, inbox, contacts, campaigns, billing.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WabaAccount,
      PhoneNumber,
      WaWebhookEvent,
      WaTemplate,
      WaTemplateExample,
      WaContact,
      WaConversation,
      WaMessage,
      WaCampaign,
      WaSubscription,
      WaContactNote,
      WaQuickReply,
      WaPipelineStage,
      WaInboxSettings,
      WaAssignmentEvent,
      WaPipelineStageTemplate,
      WaAutoReplyRule,
      WaFlow,
      WaFlowSession,
      WaApiKey,
      WorkspaceService,
      Workspace,
      WorkspaceMember,
      Plan,
      User,
    ]),
    WaWebhookQueueModule,
    WaCampaignQueueModule,
    WhatsappRealtimeModule,
    PaymentsModule,
    AdminModule,
    // PlanLimitService: the max_contacts cap on contact create.
    WorkspacesModule,
  ],
  providers: [
    MetaGraphClient,
    WhatsappConnectService,
    WhatsappTemplatesService,
    WhatsappMessagesService,
    WhatsappSendService,
    WhatsappContactsService,
    WhatsappCampaignsService,
    WhatsappBillingService,
    BillingProviderService,
    WaTemplateExamplesService,
    AdminConnectedWabasService,
    WhatsappQuickRepliesService,
    WhatsappFlowsService,
    WhatsappPipelineStagesService,
    WhatsappInboxSettingsService,
    WhatsappAutoRepliesService,
    AdminInboxOpsService,
    AdminPipelineStageTemplatesService,
    WhatsappMediaService,
    WhatsappInboxPresenceService,
    WhatsappAnalyticsService,
    WhatsappApiKeysService,
    R2UploadService,
    WorkspaceMemberGuard,
    RequiresFeatureGuard,
    ApiKeyGuard,
  ],
  controllers: [
    WhatsappConnectController,
    MetaWebhookController,
    WhatsappTemplatesController,
    WhatsappMessagesController,
    WhatsappInboxEventsController,
    WhatsappContactsController,
    WhatsappCampaignsController,
    WhatsappBillingController,
    AdminTemplateExamplesController,
    AdminConnectedWabasController,
    WhatsappTemplateExamplesController,
    WhatsappQuickRepliesController,
    WhatsappFlowsController,
    WhatsappPipelineStagesController,
    WhatsappInboxSettingsController,
    WhatsappAutoRepliesController,
    WhatsappInboxPresenceController,
    WhatsappAnalyticsController,
    WhatsappApiKeysController,
    WhatsappTriggerController,
    AdminInboxOpsController,
    AdminPipelineStageTemplatesController,
  ],
})
export class WhatsappModule {}
