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
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { CountriesService } from './countries.service';
import { CountryQueryDto } from './dto/country-query.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';

@ApiTags('admin-countries')
@Controller({ path: 'admin/countries', version: '1' })
export class CountriesController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  @StaffAuth()
  list(@Query() query: CountryQueryDto) {
    return this.countries.list(query);
  }

  @Post()
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'CURRENCY_NOT_FOUND' })
  @ApiErrorResponse({ status: 409, code: 'COUNTRY_EXISTS' })
  create(@Body() dto: CreateCountryDto) {
    return this.countries.create(dto);
  }

  @Patch(':code')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 404, code: 'COUNTRY_NOT_FOUND' })
  update(@Param('code') code: string, @Body() dto: UpdateCountryDto) {
    return this.countries.update(code, dto);
  }
}
