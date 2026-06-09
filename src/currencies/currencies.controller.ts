import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';

@ApiTags('admin-currencies')
@Controller({ path: 'admin/currencies', version: '1' })
export class CurrenciesController {
  constructor(private readonly currencies: CurrenciesService) {}

  @Get()
  @StaffAuth()
  list(@Query() query: PaginationQueryDto) {
    return this.currencies.list(query);
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 409, code: 'CURRENCY_EXISTS' })
  create(@Body() dto: CreateCurrencyDto) {
    return this.currencies.create(dto);
  }

  @Patch(':code')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'CURRENCY_NOT_FOUND' })
  update(@Param('code') code: string, @Body() dto: UpdateCurrencyDto) {
    return this.currencies.update(code, dto);
  }
}
