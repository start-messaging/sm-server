import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AddCountryDto } from './dto/add-country.dto';
import { UpsertRateDto } from './dto/upsert-rate.dto';
import { ServicePricingService } from './service-pricing.service';

@ApiTags('admin-services')
@Controller({ path: 'admin/services', version: '1' })
export class ServicePricingController {
  constructor(private readonly pricing: ServicePricingService) {}

  @Get(':key/rates')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  list(@Param('key') key: string) {
    return this.pricing.getRates(key);
  }

  @Put(':key/rates/:cc/:cat')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'SERVICE_CATEGORY_NOT_FOUND' })
  @ApiErrorResponse({ status: 400, code: 'COUNTRY_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 422, code: 'RATE_CURRENCY_MISMATCH' })
  upsert(
    @Param('key') key: string,
    @Param('cc') cc: string,
    @Param('cat') cat: string,
    @Body() dto: UpsertRateDto,
  ) {
    return this.pricing.upsertRate(key, cc, cat, dto);
  }

  @Post(':key/rates/countries')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'COUNTRY_INACTIVE' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 409, code: 'RATE_COUNTRY_EXISTS' })
  @ApiErrorResponse({ status: 422, code: 'SERVICE_HAS_NO_CATEGORIES' })
  addCountry(@Param('key') key: string, @Body() dto: AddCountryDto) {
    return this.pricing.addCountry(key, dto);
  }

  @Delete(':key/rates/:cc/:cat')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'RATE_NOT_FOUND' })
  removeRate(
    @Param('key') key: string,
    @Param('cc') cc: string,
    @Param('cat') cat: string,
  ) {
    return this.pricing.removeRate(key, cc, cat);
  }

  @Delete(':key/rates/:cc')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'RATE_COUNTRY_NOT_FOUND' })
  removeCountry(@Param('key') key: string, @Param('cc') cc: string) {
    return this.pricing.removeCountry(key, cc);
  }
}
