import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { PutLadderDto } from './dto/put-ladder.dto';
import { ResolveRateQueryDto } from './dto/resolve-rate-query.dto';
import { WorkspaceRatesService } from './workspace-rates.service';

/**
 * Workspace-tier pricing — the unified ladder. One cell's override
 * (country × category) IS a volume ladder; a flat negotiated rate is a single
 * rung at minQty 0. PUT replaces a cell's ladder wholesale.
 */
@ApiTags('admin-customers')
@Controller({ path: 'admin/workspaces', version: '1' })
export class WorkspaceRatesController {
  constructor(private readonly rates: WorkspaceRatesService) {}

  @Get(':id/services/:serviceKey/rates')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_SERVICE_NOT_FOUND' })
  list(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceKey') serviceKey: string,
  ) {
    return this.rates.getRates(id, serviceKey);
  }

  @Get(':id/services/:serviceKey/resolve')
  @StaffAuth()
  @ApiErrorResponse({ status: 400, code: 'SERVICE_CATEGORY_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 422, code: 'RATE_NOT_CONFIGURED' })
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceKey') serviceKey: string,
    @Query() query: ResolveRateQueryDto,
  ) {
    return this.rates.resolvePreview(
      id,
      serviceKey,
      query.country.toUpperCase(),
      query.category,
      query.qty,
    );
  }

  @Put(':id/services/:serviceKey/rates/:cc/:cat')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 400, code: 'SERVICE_CATEGORY_NOT_FOUND' })
  @ApiErrorResponse({ status: 400, code: 'COUNTRY_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 409, code: 'LADDER_CONFLICT' })
  @ApiErrorResponse({ status: 422, code: 'RATE_CURRENCY_MISMATCH' })
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceKey') serviceKey: string,
    @Param('cc') cc: string,
    @Param('cat') cat: string,
    @Body() dto: PutLadderDto,
  ) {
    return this.rates.replaceLadder(id, serviceKey, cc, cat, dto);
  }

  @Delete(':id/services/:serviceKey/rates/:cc/:cat')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN)
  @HttpCode(204)
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_SERVICE_NOT_FOUND' })
  @ApiErrorResponse({ status: 404, code: 'LADDER_NOT_FOUND' })
  clear(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('serviceKey') serviceKey: string,
    @Param('cc') cc: string,
    @Param('cat') cat: string,
  ) {
    return this.rates.clearLadder(id, serviceKey, cc, cat);
  }
}
