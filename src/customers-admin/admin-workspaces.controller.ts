import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AdminWorkspacesService } from './admin-workspaces.service';

/** Staff READ surface over a single workspace (the 360° header). */
@ApiTags('admin-customers')
@Controller({ path: 'admin/workspaces', version: '1' })
export class AdminWorkspacesController {
  constructor(private readonly adminWorkspaces: AdminWorkspacesService) {}

  @Get(':id')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminWorkspaces.getDetail(id);
  }
}
