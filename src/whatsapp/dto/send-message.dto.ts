import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
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
}
