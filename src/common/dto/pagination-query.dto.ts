import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Shared query DTO for paginated list endpoints. `page` is 1-based; `pageSize`
 * defaults to 20 and is capped at 100. The global ValidationPipe coerces the
 * query strings to numbers (`enableImplicitConversion`) and rejects unknown keys.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;

  /** Rows to skip — for TypeORM's `skip`. */
  get skip(): number {
    return (this.page - 1) * this.pageSize;
  }

  /** Rows to take — for TypeORM's `take`. */
  get take(): number {
    return this.pageSize;
  }
}
