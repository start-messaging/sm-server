import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Admin list query: pagination + optional draft/published filter. */
export class ListTemplateExamplesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}
