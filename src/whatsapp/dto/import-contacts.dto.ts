import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Field-mapped CSV import: the client parses the CSV itself and posts the raw
 * rows (keyed by original column header) plus a header → contact-field
 * mapping. `mapping` values are one of `phone` | `name` | `email` | `tag` |
 * `attr:<key>`; headers absent from `mapping` are skipped. Sent as a JSON
 * body alongside the legacy `multipart/form-data` `file` upload — mutually
 * exclusive, the controller branches on which one is present.
 */
export class ImportContactsDto {
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  rows?: Record<string, string>[];

  @IsOptional()
  @IsObject()
  mapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  filenameTag?: string;
}
