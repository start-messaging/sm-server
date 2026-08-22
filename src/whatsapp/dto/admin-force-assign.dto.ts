import { IsOptional, IsUUID } from 'class-validator';

export class AdminForceAssignDto {
  /**
   * The workspace member user ID to assign the conversation to.
   * Pass null or omit to unassign.
   */
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;
}
