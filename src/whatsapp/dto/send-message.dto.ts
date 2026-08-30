import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsIn(['text', 'template'])
  type!: 'text' | 'template';

  @ValidateIf((o) => o.type === 'text')
  @IsString()
  @IsNotEmpty()
  text?: string;

  @ValidateIf((o) => o.type === 'template')
  @IsString()
  @IsNotEmpty()
  templateName?: string;

  @ValidateIf((o) => o.type === 'template')
  @IsString()
  @IsNotEmpty()
  templateLanguage?: string;

  @IsOptional()
  parameters?: Record<string, string>[];

  /** Public URL for the template header media (IMAGE/VIDEO/DOCUMENT). */
  @IsOptional()
  @IsUrl()
  headerMediaUrl?: string;
}
