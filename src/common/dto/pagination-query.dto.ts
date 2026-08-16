import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * Shared query DTO for paginated list endpoints. `page` is 1-based; `pageSize`
 * defaults to 20 and is capped at 100. The global ValidationPipe coerces the
 * query strings to numbers (`enableImplicitConversion`) and rejects unknown keys.
 *
 * Defaults are applied in getters so missing query params never yield `NaN`
 * skip/take (class-transformer does not reliably apply property initializers).
 */
export class PaginationQueryDto {
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
  pageSize?: number;

  /** Rows to skip — for TypeORM's `skip`. */
  get skip(): number {
    const page = this.page && this.page > 0 ? this.page : 1;
    return (page - 1) * this.take;
  }

  /** Rows to take — for TypeORM's `take`. */
  get take(): number {
    const size =
      this.pageSize && this.pageSize > 0 ? this.pageSize : DEFAULT_PAGE_SIZE;
    return Math.min(size, MAX_PAGE_SIZE);
  }
}
