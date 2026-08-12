import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;
}
