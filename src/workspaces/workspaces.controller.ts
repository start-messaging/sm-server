import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CurrentWorkspace } from './decorators/current-workspace.decorator';
import type { WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@Controller({ path: 'workspaces', version: '1' })
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** Every workspace the caller belongs to — feeds the launcher + gallery. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.workspaces.listMine(user.id);
  }

  // The URL is the workspace context: membership is checked per request by
  // WorkspaceMemberGuard (no active-workspace claim in the JWT).
  @Get(':slug')
  @UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  getBySlug(@CurrentWorkspace() ctx: WorkspaceContext) {
    return this.workspaces.presentContext(ctx);
  }
}
