import { PartialType } from '@nestjs/mapped-types';
import {
  IsArray,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import type {
  FlowEdge,
  FlowNode,
  FlowStatus,
  FlowTriggerType,
} from '../entities/wa-flow.entity';

/**
 * `nodes` and `edges` are validated as arrays of objects only — the per-node
 * `data` shape is owned by the canvas editor and the global ValidationPipe runs
 * with `forbidNonWhitelisted`, so a typed nested class would strip it. Graph
 * correctness is enforced on activate instead of on every save (drafts are
 * expected to be incomplete).
 */
export class CreateFlowDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(['first_message', 'any_inbound', 'keyword'])
  triggerType!: FlowTriggerType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggerKeywords?: string[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  nodes?: FlowNode[];

  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  edges?: FlowEdge[];
}

export class PatchFlowDto extends PartialType(CreateFlowDto) {}

export class WaFlowDto {
  id!: string;
  name!: string;
  description!: string | null;
  status!: FlowStatus;
  triggerType!: FlowTriggerType;
  triggerKeywords!: string[];
  nodes!: FlowNode[];
  edges!: FlowEdge[];
  createdAt!: string;
  updatedAt!: string;
}
