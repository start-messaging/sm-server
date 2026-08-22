import { IsBoolean, IsIn, IsNumber, IsOptional, IsUUID } from 'class-validator';

export class PatchConversationDto {
  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';

  @IsOptional()
  @IsNumber()
  @IsIn([0])
  unreadCount?: number;

  @IsOptional()
  @IsBoolean()
  claim?: boolean;
}
