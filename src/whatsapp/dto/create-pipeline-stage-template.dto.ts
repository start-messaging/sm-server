import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { PipelineStageTemplateStatus } from '../entities/wa-pipeline-stage-template.entity';

export class CreatePipelineStageTemplateDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: PipelineStageTemplateStatus;
}
