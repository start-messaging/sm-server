import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WaFlow } from '../entities/wa-flow.entity';
import { WaFlowSession } from '../entities/wa-flow-session.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WaMessage } from '../entities/wa-message.entity';
import { WaTemplate } from '../entities/wa-template.entity';
import { WabaAccount } from '../entities/waba-account.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { MetaGraphClient } from '../services/meta-graph.client';
import { WhatsappMediaService } from '../services/whatsapp-media.service';
import { WhatsappSendService } from '../services/whatsapp-send.service';
import { WhatsappFlowRunnerService } from '../services/whatsapp-flow-runner.service';
import { WhatsappRealtimeModule } from '../realtime/whatsapp-realtime.module';
import { R2UploadService } from '../../common/services/r2-upload.service';
import { WA_FLOW_RESUME_QUEUE } from './wa-flow-resume.constants';
import { WaFlowResumeProcessor } from './wa-flow-resume.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: WA_FLOW_RESUME_QUEUE }),
    TypeOrmModule.forFeature([
      WaFlow,
      WaFlowSession,
      WaContact,
      WaConversation,
      WaMessage,
      WaTemplate,
      WabaAccount,
      PhoneNumber,
    ]),
    WhatsappRealtimeModule,
  ],
  providers: [
    WaFlowResumeProcessor,
    WhatsappFlowRunnerService,
    WhatsappSendService,
    WhatsappMediaService,
    MetaGraphClient,
    R2UploadService,
  ],
  exports: [BullModule, WhatsappFlowRunnerService],
})
export class WaFlowResumeQueueModule {}
