import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CountriesService } from './countries.service';

/**
 * Customer-facing country list (the onboarding phone picker). The `user-jwt`
 * strategy the guard relies on is registered globally by AuthModule (via
 * AppModule) — importing AuthModule here would create a module cycle, since
 * AuthModule already imports CountriesModule for mobile verification.
 */
@ApiTags('countries')
@Controller({ path: 'countries', version: '1' })
export class CountriesPublicController {
  constructor(private readonly countries: CountriesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  list() {
    return this.countries.listActivePublic();
  }
}
