import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ServiceStatus } from '../entities/service.entity';

const slug = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.toLowerCase().trim() : value;

/** Create a service. `key` is the immutable slug primary key. */
export class CreateServiceDto {
  @Transform(slug)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'key must be a lowercase slug (a–z, 0–9, _)',
  })
  @MaxLength(40)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(16)
  short!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}
