import {
  IsEmail,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PlatformRole } from '../enums/platform-role.enum';

/** A SUPER_ADMIN invites a staff member; they set their own password later. */
export class CreateStaffDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @IsEnum(PlatformRole)
  platformRole!: PlatformRole;
}
