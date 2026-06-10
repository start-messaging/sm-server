import { IsString, Length } from 'class-validator';

export class ResendOtpDto {
  @IsString()
  @Length(32, 64)
  verificationToken!: string;
}
