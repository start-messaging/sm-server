import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** List filter for countries — pagination plus optional search / active-only. */
export class CountryQueryDto extends PaginationQueryDto {
  /** Case-insensitive match on country code or name. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  search?: string;

  /** When true, return only active countries (e.g. for client-facing lists). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  activeOnly?: boolean;
}
