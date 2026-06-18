import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StaffAuth } from '../admin/decorators/staff-auth.decorator';
import { PlatformRole } from '../admin/enums/platform-role.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { AdminWalletsService } from './admin-wallets.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';

/**
 * Staff view + manual control of a workspace wallet. Reads = any staff; the
 * adjustment is money, so it is gated to SUPER_ADMIN + ADMIN + FINANCE.
 */
@ApiTags('admin-customers')
@Controller({ path: 'admin/workspaces', version: '1' })
export class AdminWalletsController {
  constructor(private readonly wallets: AdminWalletsService) {}

  @Get(':id/wallet')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  getWallet(@Param('id', ParseUUIDPipe) id: string) {
    return this.wallets.getWallet(id);
  }

  @Get(':id/wallet/transactions')
  @StaffAuth()
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  listTransactions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.wallets.listTransactions(id, query);
  }

  @Post(':id/wallet/adjust')
  @StaffAuth(PlatformRole.SUPER_ADMIN, PlatformRole.ADMIN, PlatformRole.FINANCE)
  @ApiErrorResponse({ status: 400, code: 'VALIDATION_ERROR' })
  @ApiErrorResponse({ status: 402, code: 'INSUFFICIENT_FUNDS' })
  @ApiErrorResponse({ status: 404, code: 'WORKSPACE_NOT_FOUND' })
  adjust(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdjustWalletDto) {
    return this.wallets.adjust(id, dto);
  }
}
