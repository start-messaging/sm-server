import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import type {
  CampaignAudienceCsvEntry,
  CampaignStats,
  CampaignStatus,
} from '../entities/wa-campaign.entity';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  templateName!: string;

  @IsString()
  @IsNotEmpty()
  templateLanguage!: string;

  @IsArray()
  @IsString({ each: true })
  audienceIds!: string[];

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsObject()
  variableMapping?: Record<string, string>;
}

/**
 * Shape returned by every campaign endpoint.
 *
 * `skippedOptedOut` sits outside `stats` on purpose: it is a compliance
 * counter, not a delivery outcome, and the UI must show it as
 * "Skipped (opted out)" separately from failures.
 */
export class CampaignResponseDto {
  id!: string;
  name!: string;
  status!: CampaignStatus;
  templateName!: string;
  templateLanguage!: string;
  audienceIds!: string[];
  audienceCsv!: CampaignAudienceCsvEntry[];
  variableMapping!: Record<string, string>;
  scheduledAt!: string | null;
  launchedAt!: string | null;
  completedAt!: string | null;
  stats!: CampaignStats;
  skippedOptedOut!: number;
  createdAt!: string;
  updatedAt!: string;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  audienceIds?: string[];

  @IsOptional()
  @IsString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsObject()
  variableMapping?: Record<string, string>;
}
