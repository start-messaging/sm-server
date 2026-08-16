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
import { WhatsappTemplateExamplesController } from './controllers/whatsapp-template-examples.controller';
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
import { WorkspaceService } from '../workspaces/entities/workspace-service.entity';
import { Workspace } from '../workspaces/entities/workspace.entity';
import { WorkspaceMember } from '../workspaces/entities/workspace-member.entity';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { Plan } from '../plans/entities/plan.entity';
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
      WorkspaceService,
      Workspace,
      WorkspaceMember,
      Plan,
    ]),
    WaWebhookQueueModule,
    WaCampaignQueueModule,
    WhatsappRealtimeModule,
    PaymentsModule,
    AdminModule,
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
    WorkspaceMemberGuard,
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
  ],
})
export class WhatsappModule {}
