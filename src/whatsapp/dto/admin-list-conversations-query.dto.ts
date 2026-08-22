import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AdminListConversationsQueryDto extends PaginationQueryDto {
  /** Filter by status: 'open' | 'resolved'. Omit for all. */
  @IsOptional()
  @IsString()
  status?: string;

  /** Filter by assigned user ID. Pass 'unassigned' for null assignees. */
  @IsOptional()
  @IsString()
  assignedTo?: string;
}
