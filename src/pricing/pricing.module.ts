import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCountryRate } from '../services/entities/service-country-rate.entity';
import { WorkspaceServiceRate } from '../workspaces/entities/workspace-service-rate.entity';
import { RateCacheService } from './rate-cache.service';
import { RateResolverService } from './rate-resolver.service';

/**
 * Send-time pricing — the two-tier rate resolver (docs §11) with a
 * version-stamped Redis cache. Reads the two rate tables (country base +
 * workspace ladder) but owns neither; rate WRITES live in their own modules
 * (services, customers-admin) and call `RateResolverService.invalidate` to
 * bump the cache version. Exported for those write paths plus the Phase 6
 * send pipeline.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceCountryRate, WorkspaceServiceRate]),
  ],
  providers: [RateResolverService, RateCacheService],
  exports: [RateResolverService],
})
export class PricingModule {}
