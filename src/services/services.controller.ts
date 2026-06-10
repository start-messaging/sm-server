import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServicesService } from './services.service';

@ApiTags('admin-services')
@Controller({ path: 'admin/services', version: '1' })
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @StaffAuth()
  list() {
    return this.services.list();
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'SERVICE_EXISTS' })
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @Patch(':key')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  update(@Param('key') key: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(key, dto);
  }

  @Delete(':key')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  remove(@Param('key') key: string) {
    return this.services.remove(key);
  }

  @Post(':key/categories')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 409, code: 'SERVICE_CATEGORY_EXISTS' })
  addCategory(@Param('key') key: string, @Body() dto: CreateCategoryDto) {
    return this.services.addCategory(key, dto);
  }

  @Patch(':key/categories/:catKey')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_CATEGORY_NOT_FOUND' })
  updateCategory(
    @Param('key') key: string,
    @Param('catKey') catKey: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.services.updateCategory(key, catKey, dto);
  }

  @Delete(':key/categories/:catKey')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'SERVICE_CATEGORY_NOT_FOUND' })
  removeCategory(@Param('key') key: string, @Param('catKey') catKey: string) {
    return this.services.removeCategory(key, catKey);
  }
}
