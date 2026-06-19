import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { WorkspaceRole } from '../../workspaces/entities/workspace-member.entity';

/** Invite an email into the workspace with a role. OWNER is rejected in the
 *  service (you can't invite an owner); rank rules are enforced there too. */
export class InviteMemberDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}
