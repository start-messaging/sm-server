import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import type { CreateFlowDto, PatchFlowDto, WaFlowDto } from '../dto/flow.dto';
import {
  FLOW_TERMINAL_NODE_TYPES,
  WaFlow,
  type FlowNode,
} from '../entities/wa-flow.entity';

export const FLOW_ERR = {
  NOT_FOUND: 'FLOW_NOT_FOUND',
  VALIDATION_FAILED: 'FLOW_VALIDATION_FAILED',
  DUPLICATE_ANY_INBOUND_TRIGGER: 'DUPLICATE_ANY_INBOUND_TRIGGER',
} as const;

@Injectable()
export class WhatsappFlowsService {
  constructor(
    @InjectRepository(WaFlow)
    private readonly flows: Repository<WaFlow>,
  ) {}

  /** Serialized shape returned to the client. Static so controllers can map lists. */
  static serialize(flow: WaFlow): WaFlowDto {
    return {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      triggerType: flow.triggerType,
      triggerKeywords: flow.triggerKeywords ?? [],
      nodes: flow.nodes ?? [],
      edges: flow.edges ?? [],
      createdAt: flow.createdAt.toISOString(),
      updatedAt: flow.updatedAt.toISOString(),
    };
  }

  list(workspaceId: string): Promise<WaFlow[]> {
    return this.flows.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(workspaceId: string, dto: CreateFlowDto): Promise<WaFlow> {
    const flow = this.flows.create({
      workspaceId,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      status: 'draft',
      triggerType: dto.triggerType,
      triggerKeywords: this.normalizeKeywords(dto.triggerKeywords),
      nodes: dto.nodes ?? [],
      edges: dto.edges ?? [],
    });
    return this.flows.save(flow);
  }

  async findOne(workspaceId: string, id: string): Promise<WaFlow> {
    const flow = await this.flows.findOne({ where: { id, workspaceId } });
    if (!flow) {
      throw new AppException(
        { code: FLOW_ERR.NOT_FOUND, message: 'Flow not found' },
        HttpStatus.NOT_FOUND,
      );
    }
    return flow;
  }

  async update(
    workspaceId: string,
    id: string,
    dto: PatchFlowDto,
  ): Promise<WaFlow> {
    const flow = await this.findOne(workspaceId, id);

    if (dto.name !== undefined) flow.name = dto.name.trim();
    if (dto.description !== undefined) {
      flow.description = dto.description?.trim() || null;
    }
    if (dto.triggerType !== undefined) flow.triggerType = dto.triggerType;
    if (dto.triggerKeywords !== undefined) {
      flow.triggerKeywords = this.normalizeKeywords(dto.triggerKeywords);
    }
    if (dto.nodes !== undefined) flow.nodes = dto.nodes;
    if (dto.edges !== undefined) flow.edges = dto.edges;

    return this.flows.save(flow);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const flow = await this.findOne(workspaceId, id);
    await this.flows.softRemove(flow);
  }

  /**
   * Publishes a flow. The graph is validated here rather than on save so drafts
   * can be left half-built, and `any_inbound` is capped at one active flow per
   * workspace — two catch-all bots would both answer the same message.
   */
  async activate(workspaceId: string, id: string): Promise<WaFlow> {
    const flow = await this.findOne(workspaceId, id);

    const errors = this.validateGraph(flow);
    if (errors.length > 0) {
      throw new AppException(
        {
          code: FLOW_ERR.VALIDATION_FAILED,
          message: 'This flow cannot be activated yet',
          details: { errors },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (flow.triggerType === 'any_inbound') {
      const conflict = await this.flows.findOne({
        where: {
          workspaceId,
          status: 'active',
          triggerType: 'any_inbound',
          id: Not(flow.id),
        },
      });
      if (conflict) {
        throw new AppException(
          {
            code: FLOW_ERR.DUPLICATE_ANY_INBOUND_TRIGGER,
            message: `"${conflict.name}" already replies to every incoming message. Deactivate it first.`,
            details: { conflictingFlowId: conflict.id },
          },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
    }

    flow.status = 'active';
    return this.flows.save(flow);
  }

  async deactivate(workspaceId: string, id: string): Promise<WaFlow> {
    const flow = await this.findOne(workspaceId, id);
    flow.status = 'inactive';
    return this.flows.save(flow);
  }

  /** Human-readable reasons the graph is not runnable; empty array = valid. */
  private validateGraph(flow: WaFlow): string[] {
    const errors: string[] = [];
    const nodes = flow.nodes ?? [];
    const edges = flow.edges ?? [];

    const triggers = nodes.filter((n) => n.type === 'trigger');
    if (triggers.length === 0) {
      errors.push('The flow needs a trigger step to know when to start.');
    } else if (triggers.length > 1) {
      errors.push('The flow has more than one trigger step. Keep only one.');
    }

    const sources = new Set(edges.map((e) => e.source));
    for (const node of nodes) {
      if (FLOW_TERMINAL_NODE_TYPES.includes(node.type)) continue;
      if (!sources.has(node.id)) {
        errors.push(
          `Step "${this.nodeLabel(node)}" is not connected to a next step.`,
        );
      }
    }

    for (const node of nodes) {
      if (node.type !== 'button_branch' && node.type !== 'list_branch') {
        continue;
      }
      const options = node.data?.options;
      if (!Array.isArray(options) || options.length === 0) {
        errors.push(
          `Step "${this.nodeLabel(node)}" needs at least one option for the contact to choose.`,
        );
      }
    }

    return errors;
  }

  private nodeLabel(node: FlowNode): string {
    const label = node.data?.label;
    return typeof label === 'string' && label.trim() ? label : node.type;
  }

  private normalizeKeywords(keywords: string[] | undefined): string[] {
    if (!keywords) return [];
    return Array.from(
      new Set(keywords.map((k) => k.trim()).filter((k) => k.length > 0)),
    );
  }
}
