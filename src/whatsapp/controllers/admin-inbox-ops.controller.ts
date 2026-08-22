import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../../admin/decorators/staff-auth.decorator';
import { CurrentStaff } from '../../admin/decorators/current-staff.decorator';
import { PlatformRole } from '../../admin/enums/platform-role.enum';
import type { AuthenticatedStaff } from '../../admin/strategies/staff-jwt.strategy';
import { AdminInboxOpsService } from '../services/admin-inbox-ops.service';
import { AdminListConversationsQueryDto } from '../dto/admin-list-conversations-query.dto';
import { AdminForceAssignDto } from '../dto/admin-force-assign.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

@ApiTags('admin-whatsapp-inbox-ops')
@Controller({
  path: 'admin/whatsapp/workspaces/:workspaceId',
  version: '1',
})
export class AdminInboxOpsController {
  constructor(private readonly service: AdminInboxOpsService) {}

  @Get('conversations')
  @StaffAuth()
  @ApiOperation({
    summary: 'List conversations for a workspace (staff observe)',
  })
  listConversations(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query() query: AdminListConversationsQueryDto,
  ) {
    return this.service.listConversations(workspaceId, query);
  }

  @Get('conversations/:conversationId/messages')
  @StaffAuth()
  @ApiOperation({
    summary: 'Read-only message thread for a conversation (staff observe)',
  })
  listMessages(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.service.listMessages(workspaceId, conversationId, query);
  }

  @Get('conversations/:conversationId/assignment-events')
  @StaffAuth()
  @ApiOperation({ summary: 'Assignment audit log for a conversation' })
  listAssignmentEvents(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.service.listAssignmentEvents(workspaceId, conversationId);
  }

  @Post('conversations/:conversationId/assign')
  @StaffAuth(
    PlatformRole.SUPER_ADMIN,
    PlatformRole.ADMIN,
    PlatformRole.SUPPORT,
    PlatformRole.RELATIONSHIP_MANAGER,
  )
  @ApiOperation({
    summary: 'Force-assign or unassign a conversation (platform staff)',
  })
  forceAssign(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body() dto: AdminForceAssignDto,
    @CurrentStaff() staff: AuthenticatedStaff,
  ) {
    return this.service.forceAssign(workspaceId, conversationId, dto, staff.id);
  }

  @Get('members-load')
  @StaffAuth()
  @ApiOperation({
    summary: 'Workspace members with their open conversation counts',
  })
  getMembersLoad(@Param('workspaceId', ParseUUIDPipe) workspaceId: string) {
    return this.service.getMembersLoad(workspaceId);
  }
}
