import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';

/** Staff READ surface over customers. No writes — signup is the only door. */
@ApiTags('admin-customers')
@Controller({ path: 'admin/users', version: '1' })
export class AdminUsersController {
  constructor(private readonly adminUsers: AdminUsersService) {}

  @Get()
  @StaffAuth()
  list(@Query() query: AdminUsersQueryDto) {
    return this.adminUsers.list(query);
  }

  @Get(':id')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'USER_NOT_FOUND' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminUsers.getDetail(id);
  }
}
