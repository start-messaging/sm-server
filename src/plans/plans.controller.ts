import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { ENTITLEMENT_CATALOG } from './plan-keys';
import { PlansService } from './plans.service';

@ApiTags('admin-plans')
@Controller({ path: 'admin/plans', version: '1' })
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @StaffAuth()
  list() {
    return this.plans.listAll();
  }

  @Get('entitlement-catalog')
  @StaffAuth()
  entitlementCatalog() {
    return ENTITLEMENT_CATALOG;
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 409, code: 'PLAN_EXISTS' })
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Patch(':id')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'PLAN_NOT_FOUND' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}
