import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspacesService } from './workspaces.service';

/**
 * Service-first creation route: a workspace is born UNDER a service
 * (POST /v1/services/:serviceKey/workspaces) — matching the gallery UX where
 * the user picks a service first. Lives in the workspaces module; the
 * services module only describes the catalogue.
 */
@ApiTags('workspaces')
@Controller({ path: 'services/:serviceKey/workspaces', version: '1' })
export class CreateWorkspaceController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'SERVICE_NOT_AVAILABLE' })
  @ApiErrorResponse({ status: 400, code: 'COUNTRY_NOT_SUPPORTED' })
  @ApiErrorResponse({ status: 403, code: 'COUNTRY_NOT_SET' })
  @ApiErrorResponse({ status: 403, code: 'PLAN_LIMIT_REACHED' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serviceKey') serviceKey: string,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspaces.createForService(user.id, serviceKey, dto);
  }
}
