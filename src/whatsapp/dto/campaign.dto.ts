import {
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

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
