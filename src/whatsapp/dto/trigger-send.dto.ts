import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * Body of `POST /api/v1/trigger/send`.
 *
 * The trigger API can only send templates: an external system has no session
 * to reply into, so the 24-hour customer-care window is always assumed closed.
 */
export class TriggerSendDto {
  /** Recipient in E.164, e.g. `+919876543210`. */
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, {
    message: 'to must be an E.164 phone number, e.g. +919876543210',
  })
  to!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  templateName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  templateLanguage!: string;

  /** Positional BODY variables: `[{ text: 'Ada' }, { text: '#1042' }]`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsObject({ each: true })
  parameters?: Record<string, string>[];

  /**
   * Reserved for workspaces with more than one sender. Accepted today so the
   * request shape stays stable; the send uses the workspace's active number.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneNumberId?: string;
}
