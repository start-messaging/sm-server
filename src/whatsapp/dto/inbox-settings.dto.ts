import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class PatchInboxSettingsDto {
  /** ADMIN+ only; controls workspace-wide round-robin routing. */
  @IsOptional()
  @IsBoolean()
  roundRobinEnabled?: boolean;

  /**
   * AGENT+; sets the caller's own availability for round-robin assignment.
   * Agents can mark themselves unavailable (e.g. end of shift).
   */
  @IsOptional()
  @IsBoolean()
  inboxAvailable?: boolean;

  /**
   * ADMIN+ only; suppresses a keyword auto-reply when a human agent replied in
   * the conversation within this many seconds. 0 disables the grace window.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  autoReplyDelaySeconds?: number;
}
