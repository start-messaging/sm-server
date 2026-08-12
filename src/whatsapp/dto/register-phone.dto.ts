import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class RegisterPhoneDto {
  @ApiProperty({
    description: 'Two-step verification PIN (6 digits) for Cloud API register',
    example: '123456',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'pin must be exactly 6 digits' })
  @Length(6, 6)
  pin!: string;
}
