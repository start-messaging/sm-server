import { IsNotEmpty, IsString } from 'class-validator';

export class CreateContactNoteDto {
  @IsString()
  @IsNotEmpty()
  body!: string;
}
