import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const slug = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() : value;

/** Add a message category to a service. `key` is unique within the service. */
export class CreateCategoryDto {
  @Transform(slug)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'key must be a lowercase slug (a–z, 0–9, _)',
  })
  @MaxLength(40)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  hint?: string;
}
