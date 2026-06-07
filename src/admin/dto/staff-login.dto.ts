import { IsEmail, IsString, MinLength } from 'class-validator';

export class StaffLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
