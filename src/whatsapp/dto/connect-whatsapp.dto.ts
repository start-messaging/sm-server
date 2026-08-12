import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from 'class-validator';

export class ConnectWhatsappDto {
  @ApiProperty({
    description: 'Short-lived code from Meta Embedded Signup v4 callback',
  })
  @IsString()
  code!: string;

  @ApiPropertyOptional({
    description:
      'Meta WABA id from ES session. Auto-discovered from Graph if omitted.',
  })
  @IsOptional()
  @IsString()
  wabaId?: string;

  @ApiPropertyOptional({
    description:
      'Meta phone number id from ES session. Auto-discovered from Graph if omitted.',
  })
  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @ApiPropertyOptional({
    description:
      'Two-step verification PIN (6 digits). Required to complete phone registration.',
    example: '123456',
  })
  @IsOptional()
  @ValidateIf((o: ConnectWhatsappDto) => o.pin !== undefined)
  @IsString()
  @Matches(/^\d{6}$/, { message: 'pin must be exactly 6 digits' })
  @Length(6, 6)
  pin?: string;
}
