import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_PAGE_SIZE } from '../../common/dto/pagination-query.dto';

const DEFAULT_LIMIT = 50;

const toBoolean = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

const toArray = ({ value }: { value: unknown }) =>
  value === undefined ? value : Array.isArray(value) ? value : [value];

/** Contact list filters: free-text search, tags, pipeline/assignee, opt-in, follow-up. */
export class ListContactsQueryDto {
  /** Matches name OR phone, case-insensitive substring. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Contact must have at least one of these tags. */
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  tag?: string[];

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  optedIn?: boolean;

  /** When true, only contacts with a non-null followUpAt. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  hasFollowUp?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit?: number;

  /** Rows to skip — for TypeORM's `skip`. */
  get skip(): number {
    const page = this.page && this.page > 0 ? this.page : 1;
    return (page - 1) * this.take;
  }

  /** Rows to take — for TypeORM's `take`. */
  get take(): number {
    return this.limit && this.limit > 0 ? this.limit : DEFAULT_LIMIT;
  }
}
