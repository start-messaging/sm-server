import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InteractiveHeaderDto {
  @IsString()
  @IsIn(['text', 'image', 'video', 'document'])
  type!: 'text' | 'image' | 'video' | 'document';

  @IsOptional()
  @IsString()
  @MaxLength(60)
  text?: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string;
}

export class InteractiveButtonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  title!: string;
}

export class InteractiveRowDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  id!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(24)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(72)
  description?: string;
}

export class InteractiveSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(24)
  title?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InteractiveRowDto)
  rows!: InteractiveRowDto[];
}

export class SendInteractiveDto {
  @IsString()
  @IsIn(['button', 'list'])
  interactiveType!: 'button' | 'list';

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  body!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => InteractiveHeaderDto)
  header?: InteractiveHeaderDto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer?: string;

  /** Required when interactiveType = 'button'. Max 3 buttons. */
  @ValidateIf((o: SendInteractiveDto) => o.interactiveType === 'button')
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => InteractiveButtonDto)
  buttons?: InteractiveButtonDto[];

  /** Required when interactiveType = 'list'. The "open list" button label. */
  @ValidateIf((o: SendInteractiveDto) => o.interactiveType === 'list')
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  buttonLabel?: string;

  /** Required when interactiveType = 'list'. */
  @ValidateIf((o: SendInteractiveDto) => o.interactiveType === 'list')
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => InteractiveSectionDto)
  sections?: InteractiveSectionDto[];
}
