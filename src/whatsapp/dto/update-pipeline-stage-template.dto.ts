import { PartialType } from '@nestjs/mapped-types';
import { CreatePipelineStageTemplateDto } from './create-pipeline-stage-template.dto';

export class UpdatePipelineStageTemplateDto extends PartialType(
  CreatePipelineStageTemplateDto,
) {}
