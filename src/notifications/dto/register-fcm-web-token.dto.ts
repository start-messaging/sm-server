import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RegisterFcmWebTokenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;
}
