import { IsString, Matches, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(1)
  verificationToken!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
