import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import { MinRole } from '../workspaces/decorators/min-role.decorator';
import { WorkspaceRole } from '../workspaces/entities/workspace-member.entity';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MemberInviteService } from './member-invite.service';
import { MembersService } from './members.service';

/**
 * Workspace member management (customer-facing). Every route runs behind
 * `JwtAuthGuard` + `WorkspaceMemberGuard`; listing needs any active member
 * (VIEWER), writes need ADMIN+. The URL `:slug` is the workspace context.
 */
@ApiTags('members')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
@Controller({ path: 'workspaces/:slug/members', version: '1' })
export class MembersController {
  constructor(
    private readonly members: MembersService,
    private readonly invites: MemberInviteService,
  ) {}

  @Get()
  @MinRole(WorkspaceRole.VIEWER)
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  list(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.members.list(ctx.workspace.id);
  }

  @Post('invitations')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 403, code: 'WORKSPACE_ROLE_FORBIDDEN' })
  @ApiErrorResponse({ status: 403, code: 'PLAN_LIMIT_REACHED' })
  @ApiErrorResponse({ status: 409, code: 'ALREADY_MEMBER' })
  @ApiErrorResponse({ status: 409, code: 'CANNOT_INVITE_OWNER' })
  @ApiErrorResponse({ status: 409, code: 'INVITE_PENDING' })
  invite(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invites.invite(ctx, user.id, dto);
  }

  @Post('invitations/:invId/resend')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiErrorResponse({ status: 404, code: 'INVITE_NOT_FOUND' })
  resend(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('invId', ParseUUIDPipe) invId: string,
  ) {
    return this.invites.resend(ctx, invId);
  }

  @Delete('invitations/:invId')
  @MinRole(WorkspaceRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'INVITE_NOT_FOUND' })
  revoke(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('invId', ParseUUIDPipe) invId: string,
  ) {
    return this.invites.revoke(ctx, invId);
  }

  @Patch(':memberId/role')
  @MinRole(WorkspaceRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'CANNOT_ASSIGN_OWNER' })
  @ApiErrorResponse({ status: 400, code: 'MEMBER_SELF_ACTION' })
  @ApiErrorResponse({ status: 403, code: 'CANNOT_MODIFY_OWNER' })
  @ApiErrorResponse({ status: 403, code: 'WORKSPACE_ROLE_FORBIDDEN' })
  @ApiErrorResponse({ status: 404, code: 'MEMBER_NOT_FOUND' })
  changeRole(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.members.changeRole(ctx, memberId, dto);
  }

  @Delete(':memberId')
  @MinRole(WorkspaceRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 400, code: 'MEMBER_SELF_ACTION' })
  @ApiErrorResponse({ status: 403, code: 'CANNOT_MODIFY_OWNER' })
  @ApiErrorResponse({ status: 404, code: 'MEMBER_NOT_FOUND' })
  remove(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Param('memberId', ParseUUIDPipe) memberId: string,
  ) {
    return this.members.remove(ctx, memberId);
  }
}
