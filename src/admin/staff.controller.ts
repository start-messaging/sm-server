import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { StaffAuth } from './decorators/staff-auth.decorator';
import { CreateStaffDto } from './dto/create-staff.dto';
import { PlatformRole } from './enums/platform-role.enum';
import { StaffService } from './staff.service';

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
  list() {
    return this.staff.list();
  }
}
