import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TemplateComponentDto } from './create-template.dto';

export class UpdateTemplateExampleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Slug may only contain lowercase letters, digits, and underscores',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Suggested name may only contain lowercase letters, digits, and underscores',
  })
  suggestedName?: string;

  @IsOptional()
  @IsString()
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateComponentDto)
  components?: TemplateComponentDto[];

  @IsOptional()
  @IsString()
  useWhen?: string;

  @IsOptional()
  @IsString()
  metaTip?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsIn(['draft', 'published'])
  status?: 'draft' | 'published';
}
