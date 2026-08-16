import { Type } from 'class-transformer';
import {
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
