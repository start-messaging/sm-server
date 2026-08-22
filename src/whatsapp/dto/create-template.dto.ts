import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Nested sample values Meta requires when the component text has {{n}}. */
export class TemplateComponentExampleDto {
  @IsOptional()
  @IsArray()
  body_text?: string[][];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  header_text?: string[];
}

/**
 * One button inside a BUTTONS component.
 *
 * Meta shapes (Business Management API):
 *   QUICK_REPLY  → { type, text }
 *   URL          → { type, text, url, example?: [string] }  (example required if url has {{1}})
 *   PHONE_NUMBER → { type, text, phone_number }
 */
export class TemplateButtonDto {
  @IsString()
  @IsIn(['QUICK_REPLY', 'URL', 'PHONE_NUMBER'])
  type!: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

  /** Button label — Max 25 chars per Meta. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  text!: string;

  /** URL buttons only. Supports one {{1}} variable at the end of the URL. */
  @IsOptional()
  @IsString()
  url?: string;

  /**
   * URL buttons only: sample value(s) for the {{1}} variable in `url`.
   * Meta requires this when the url string contains {{1}}.
   * Send as a single-element array, e.g. ["https://example.com/promo"].
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  example?: string[];

  /** PHONE_NUMBER buttons only. E.164 format. */
  @IsOptional()
  @IsString()
  phone_number?: string;
}

/** Nested component — must be decorated or ValidationPipe whitelist strips fields. */
export class TemplateComponentDto {
  @IsString()
  @IsIn(['HEADER', 'BODY', 'FOOTER', 'BUTTONS'])
  type!: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsIn(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  format?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateComponentExampleDto)
  example?: TemplateComponentExampleDto;

  /**
   * BUTTONS component only: 1–3 buttons.
   * Must use @ValidateNested + @Type so ValidationPipe whitelist does not strip nested fields.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];
}

export class CreateTemplateDto {
  /** Meta: lowercase alphanumeric + underscore only, max 512. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Template name may only contain lowercase letters, digits, and underscores',
  })
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language!: string;

  @IsString()
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  components!: TemplateComponentDto[];
}
