import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  AutoReplyMatchType,
  AutoReplyType,
} from '../wa-auto-reply-rule.entity';

const MATCH_TYPES: AutoReplyMatchType[] = ['exact', 'contains', 'starts_with'];
const REPLY_TYPES: AutoReplyType[] = ['text', 'template'];

export class CreateAutoReplyRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keywords!: string[];

  @IsIn(MATCH_TYPES)
  matchType!: AutoReplyMatchType;

  @IsIn(REPLY_TYPES)
  replyType!: AutoReplyType;

  /** Required when replyType is `text`. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  replyText?: string;

  /** Required when replyType is `template`. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  replyTemplateName?: string;

  /** Required when replyType is `template` (e.g. `en_US`). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  replyTemplateLanguage?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Lower number is evaluated first. Defaults to 0. */
  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpdateAutoReplyRuleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  keywords?: string[];

  @IsOptional()
  @IsIn(MATCH_TYPES)
  matchType?: AutoReplyMatchType;

  @IsOptional()
  @IsIn(REPLY_TYPES)
  replyType?: AutoReplyType;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  replyText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  replyTemplateName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  replyTemplateLanguage?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
