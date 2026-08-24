import { IsArray, IsObject } from 'class-validator';

/**
 * CSV audience upload for a campaign (Track 5c). The client parses the CSV
 * itself and posts plain row objects: `phone` (required), `name` (optional),
 * and any `attr:<key>` columns for template variable mapping. Kept as
 * `Record<string, string>` rather than a typed class — like
 * `ImportContactsDto` — since the `attr:*` keys are dynamic and the global
 * `ValidationPipe` runs with `forbidNonWhitelisted: true`.
 */
export class CampaignAudienceCsvDto {
  @IsArray()
  @IsObject({ each: true })
  rows!: Record<string, string>[];
}
