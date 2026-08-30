import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { WaFlow, type FlowNode } from '../entities/wa-flow.entity';
import { WaFlowSession } from '../entities/wa-flow-session.entity';
import { WaContact } from '../entities/wa-contact.entity';
import { WaConversation } from '../entities/wa-conversation.entity';
import { WhatsappSendService } from './whatsapp-send.service';
import { WA_FLOW_RESUME_QUEUE } from '../queue/wa-flow-resume.constants';

export interface ResumeJobData {
  sessionId: string;
  workspaceId: string;
}

function toDelayMs(amount: number, unit: string): number {
  const n = Math.max(1, Math.min(amount, 365));
  switch (unit) {
    case 'minutes':
      return n * 60_000;
    case 'days':
      return n * 86_400_000;
    default:
      return n * 3_600_000;
  }
}

@Injectable()
export class WhatsappFlowRunnerService {
  private readonly logger = new Logger(WhatsappFlowRunnerService.name);

  constructor(
    @InjectRepository(WaFlow)
    private readonly flows: Repository<WaFlow>,
    @InjectRepository(WaFlowSession)
    private readonly sessions: Repository<WaFlowSession>,
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaConversation)
    private readonly conversations: Repository<WaConversation>,
    private readonly sendService: WhatsappSendService,
    @InjectQueue(WA_FLOW_RESUME_QUEUE)
    private readonly flowResumeQueue: Queue,
  ) {}

  /** Advance flow from a timer-fired delay: load context, skip past wait_delay node. */
  async resumeAfterDelay(sessionId: string): Promise<void> {
    const session = await this.sessions.findOne({
      where: { id: sessionId, status: 'active' },
    });
    if (!session) return;

    session.nextFireAt = null;
    await this.sessions.save(session);

    const flow = await this.flows.findOne({ where: { id: session.flowId } });
    if (!flow) {
      session.status = 'exited';
      await this.sessions.save(session);
      return;
    }

    const conversation = await this.conversations.findOne({
      where: { id: session.conversationId },
    });
    if (!conversation) {
      session.status = 'exited';
      await this.sessions.save(session);
      return;
    }

    const contact = conversation.contactId
      ? await this.contacts.findOne({ where: { id: conversation.contactId } })
      : null;
    if (!contact) {
      session.status = 'exited';
      await this.sessions.save(session);
      return;
    }

    const nextId = this.followEdge(flow, session.currentNodeId);
    await this.advanceToNext(nextId, session, flow, conversation, contact);
  }

  async executeFrom(
    session: WaFlowSession,
    flow: WaFlow,
    startNodeId: string,
    conversation: WaConversation,
    contact: WaContact,
  ): Promise<void> {
    const node = flow.nodes.find((n) => n.id === startNodeId);
    if (!node) {
      session.status = 'completed';
      await this.sessions.save(session);
      return;
    }
    await this.executeNode(node, session, flow, conversation, contact);
  }

  followEdge(
    flow: WaFlow,
    fromNodeId: string,
    handleId?: string,
  ): string | null {
    const edge = flow.edges.find(
      (e) =>
        e.source === fromNodeId &&
        (handleId !== undefined ? e.sourceHandle === handleId : true),
    );
    return edge?.target ?? null;
  }

  private async executeNode(
    node: FlowNode,
    session: WaFlowSession,
    flow: WaFlow,
    conversation: WaConversation,
    contact: WaContact,
  ): Promise<void> {
    const workspaceId = conversation.workspaceId;
    session.currentNodeId = node.id;
    await this.sessions.save(session);

    switch (node.type) {
      case 'trigger': {
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'send_message': {
        const text = this.substituteVars(
          (node.data['message'] as string | null | undefined) ?? '',
          session,
          contact,
        );
        try {
          await this.sendService.send(workspaceId, conversation.id, {
            type: 'text',
            text,
          });
        } catch (err) {
          this.logger.warn(
            `flow send_message failed conv=${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'set_field': {
        const field = (node.data['field'] as string | null | undefined) ?? '';
        const value = this.substituteVars(
          (node.data['value'] as string | null | undefined) ?? '',
          session,
          contact,
        );
        if (field) {
          session.variables = { ...session.variables, [field]: value };
          await this.sessions.save(session);
        }
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'add_tag': {
        const tag = (node.data['tag'] as string | null | undefined) ?? '';
        if (tag && !contact.tags.includes(tag)) {
          contact.tags = [...contact.tags, tag];
          await this.contacts.save(contact);
        }
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'remove_tag': {
        const tag = (node.data['tag'] as string | null | undefined) ?? '';
        if (tag) {
          contact.tags = contact.tags.filter((t) => t !== tag);
          await this.contacts.save(contact);
        }
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'change_stage': {
        contact.pipelineStageId =
          (node.data['stageId'] as string | null) ?? null;
        await this.contacts.save(contact);
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      case 'assign_agent': {
        conversation.assignedToUserId =
          (node.data['userId'] as string | null) ?? null;
        await this.conversations.save(conversation);
        session.status = 'exited';
        await this.sessions.save(session);
        break;
      }

      case 'end': {
        session.status = 'completed';
        await this.sessions.save(session);
        break;
      }

      case 'wait_for_reply': {
        session.waitingForReply = true;
        await this.sessions.save(session);
        break;
      }

      case 'wait_delay': {
        const delayAmount =
          (node.data['delayAmount'] as number | undefined) ?? 1;
        const delayUnit =
          (node.data['delayUnit'] as string | undefined) ?? 'hours';
        const ms = toDelayMs(delayAmount, delayUnit);
        session.nextFireAt = new Date(Date.now() + ms);
        session.waitingForReply = false;
        await this.sessions.save(session);
        await this.flowResumeQueue.add(
          'resume-session',
          { sessionId: session.id, workspaceId: session.workspaceId },
          {
            delay: ms,
            jobId: `flow-resume:${session.id}`,
            removeOnComplete: true,
          },
        );
        return;
      }

      case 'button_branch': {
        const body = (node.data['body'] as string | null | undefined) ?? '';
        const options =
          (node.data['options'] as
            | Array<{ id: string; title: string }>
            | undefined) ?? [];
        try {
          await this.sendService.sendInteractive(workspaceId, conversation.id, {
            interactiveType: 'button',
            body,
            buttons: options,
          });
        } catch (err) {
          this.logger.warn(
            `flow button_branch send failed conv=${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          try {
            await this.sendService.send(workspaceId, conversation.id, {
              type: 'text',
              text: body,
            });
          } catch (e2) {
            this.logger.warn(
              `flow button_branch fallback failed conv=${conversation.id}: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
        session.waitingForReply = true;
        await this.sessions.save(session);
        break;
      }

      case 'list_branch': {
        const body = (node.data['body'] as string | null | undefined) ?? '';
        const buttonLabel =
          (node.data['buttonLabel'] as string | null | undefined) ?? 'Choose';
        const options =
          (node.data['options'] as
            | Array<{ id: string; title: string }>
            | undefined) ?? [];
        try {
          await this.sendService.sendInteractive(workspaceId, conversation.id, {
            interactiveType: 'list',
            body,
            buttonLabel,
            sections: [{ rows: options }],
          });
        } catch (err) {
          this.logger.warn(
            `flow list_branch send failed conv=${conversation.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          try {
            await this.sendService.send(workspaceId, conversation.id, {
              type: 'text',
              text: body,
            });
          } catch (e2) {
            this.logger.warn(
              `flow list_branch fallback failed conv=${conversation.id}: ${e2 instanceof Error ? e2.message : String(e2)}`,
            );
          }
        }
        session.waitingForReply = true;
        await this.sessions.save(session);
        break;
      }

      case 'condition': {
        const variable =
          (node.data['variable'] as string | null | undefined) ?? '';
        const operator =
          (node.data['operator'] as string | null | undefined) ?? 'equals';
        const value = (node.data['value'] as string | null | undefined) ?? '';
        const actual = session.variables[variable] ?? '';

        let passes = false;
        if (operator === 'equals') passes = actual === value;
        else if (operator === 'contains')
          passes = actual.toLowerCase().includes(value.toLowerCase());
        else if (operator === 'not_equals') passes = actual !== value;

        const next = this.followEdge(flow, node.id, passes ? 'yes' : 'no');
        await this.advanceToNext(next, session, flow, conversation, contact);
        break;
      }

      default: {
        const next = this.followEdge(flow, node.id);
        await this.advanceToNext(next, session, flow, conversation, contact);
      }
    }
  }

  private async advanceToNext(
    nextId: string | null,
    session: WaFlowSession,
    flow: WaFlow,
    conversation: WaConversation,
    contact: WaContact,
  ): Promise<void> {
    if (nextId) {
      await this.executeFrom(session, flow, nextId, conversation, contact);
    } else if (session.status === 'active') {
      session.status = 'completed';
      await this.sessions.save(session);
    }
  }

  substituteVars(
    template: string,
    session: WaFlowSession,
    contact: WaContact,
  ): string {
    return template
      .replace(/\{\{contact\.name\}\}/g, contact.name ?? '')
      .replace(/\{\{contact\.phone\}\}/g, contact.phoneE164 ?? '')
      .replace(/\{\{contact\.email\}\}/g, contact.email ?? '')
      .replace(/\{\{reply\}\}/g, session.variables['reply'] ?? '');
  }
}
