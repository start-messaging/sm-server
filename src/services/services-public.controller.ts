import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { AppException } from '../common/exceptions/app.exception';
import { ApiErrorResponse } from '../common/swagger/api-error-response.decorator';
import { UsersService } from '../users/users.service';
import { ServicesPublicService } from './services-public.service';

/** Customer-facing service catalogue: what's available in *my* country. */
@ApiTags('services')
@Controller({ path: 'services', version: '1' })
export class ServicesPublicController {
  constructor(
    private readonly servicesPublic: ServicesPublicService,
    private readonly users: UsersService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiErrorResponse({ status: 403, code: 'COUNTRY_NOT_SET' })
  async list(@CurrentUser() principal: AuthenticatedUser) {
    // Country isn't in the JWT — read it fresh so a just-finished mobile step
    // is reflected without re-login.
    const user = await this.users.getById(principal.id);
    if (!user.countryCode) {
      throw new AppException(
        {
          code: 'COUNTRY_NOT_SET',
          message: 'Verify your mobile number first',
        },
        403,
      );
    }
    return this.servicesPublic.listForCustomer(user.countryCode);
  }
}
