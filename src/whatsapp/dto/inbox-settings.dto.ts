import { IsBoolean, IsOptional } from 'class-validator';

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
}
