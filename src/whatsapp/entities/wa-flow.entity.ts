import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export type FlowStatus = 'draft' | 'active' | 'inactive';

export type FlowTriggerType = 'first_message' | 'any_inbound' | 'keyword';

export type FlowNodeType =
  | 'trigger'
  | 'send_message'
  | 'wait_for_reply'
  | 'button_branch'
  | 'list_branch'
  | 'condition'
  | 'set_field'
  | 'add_tag'
  | 'remove_tag'
  | 'change_stage'
  | 'assign_agent'
  | 'end';

/**
 * Node types that legitimately have no outgoing edge: `end` stops the flow and
 * `assign_agent` hands the conversation to a human.
 */
export const FLOW_TERMINAL_NODE_TYPES: readonly FlowNodeType[] = [
  'end',
  'assign_agent',
];

/**
 * One step on the canvas. `data` is deliberately untyped — each node type
 * carries its own config shape (message body, tag name, branch options…) and
 * the client owns the editor for it.
 */
export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

/** A connection between two nodes. Handles identify which branch was taken. */
export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle: string | null;
  target: string;
  targetHandle: string | null;
}

/**
 * A no-code chatbot flow (Feature 3). Distinct from a Meta WhatsApp Flow
 * (`wa_meta_flows`), which is Meta's in-chat form builder — this graph runs on
 * our side, driven by the inbound webhook worker.
 */
@Index('idx_wa_flows_workspace_status', ['workspaceId', 'status'])
@Entity({ name: 'wa_flows' })
export class WaFlow extends BaseEntity {
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'draft' })
  status!: FlowStatus;

  @Column({ name: 'trigger_type', type: 'varchar', length: 20 })
  triggerType!: FlowTriggerType;

  /** Only meaningful when `triggerType` is `keyword`. */
  @Column({ name: 'trigger_keywords', type: 'jsonb', default: '[]' })
  triggerKeywords!: string[];

  @Column({ type: 'jsonb', default: '[]' })
  nodes!: FlowNode[];

  @Column({ type: 'jsonb', default: '[]' })
  edges!: FlowEdge[];
}
