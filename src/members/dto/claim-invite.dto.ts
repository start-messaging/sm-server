import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Claim an invite as a brand-new user: the token already proves the email, so
 * we only collect a name + password (no email-OTP). Password rules mirror
 * SignupDto.
 */
export class ClaimInviteDto {
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;
}
