import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  WhatsappFlowRunnerService,
  type ResumeJobData,
} from '../services/whatsapp-flow-runner.service';
import { WA_FLOW_RESUME_QUEUE } from './wa-flow-resume.constants';

@Processor(WA_FLOW_RESUME_QUEUE)
export class WaFlowResumeProcessor extends WorkerHost {
  private readonly logger = new Logger(WaFlowResumeProcessor.name);

  constructor(private readonly flowRunner: WhatsappFlowRunnerService) {
    super();
  }

  async process(job: Job<ResumeJobData>): Promise<void> {
    const { sessionId } = job.data;
    this.logger.debug(`Resuming flow session ${sessionId} after delay`);
    await this.flowRunner.resumeAfterDelay(sessionId);
  }
}
