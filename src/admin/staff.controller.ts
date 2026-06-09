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
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CurrentStaff } from './decorators/current-staff.decorator';
import { StaffAuth } from './decorators/staff-auth.decorator';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { PlatformRole } from './enums/platform-role.enum';
import { StaffService } from './staff.service';
import type { AuthenticatedStaff } from './strategies/staff-jwt.strategy';

@ApiTags('admin-staff')
@Controller({ path: 'admin/staff', version: '1' })
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'STAFF_EMAIL_TAKEN' })
  invite(@Body() dto: CreateStaffDto) {
    return this.staff.invite(dto);
  }

  @Get()
  @StaffAuth(PlatformRole.SUPER_ADMIN)
  list(@Query() query: PaginationQueryDto) {
    return this.staff.list(query);
  }

  @Patch(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'STAFF_SELF_ACTION' })
  @ApiErrorResponse({ status: 400, code: 'STAFF_LAST_SUPER_ADMIN' })
  @ApiErrorResponse({ status: 404, code: 'STAFF_NOT_FOUND' })
  update(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staff.update(me.id, id, dto);
  }

  @Delete(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 400, code: 'STAFF_SELF_ACTION' })
  @ApiErrorResponse({ status: 400, code: 'STAFF_LAST_SUPER_ADMIN' })
  @ApiErrorResponse({ status: 404, code: 'STAFF_NOT_FOUND' })
  remove(
    @CurrentStaff() me: AuthenticatedStaff,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staff.remove(me.id, id);
  }
}
